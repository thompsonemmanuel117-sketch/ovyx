import { assertAuthenticated } from '../../_lib/firebase.js';
import {
  readJson,
  json,
  errorResponse,
  requestId,
} from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';
import { buildStudioMultiPage } from '../../_lib/studio-multipage.js';
import { WEB_STUDIO_SYSTEM_PROMPT, WEB_STUDIO_EXCELLENCE } from '../../_lib/prompts.js';
import { buildExperienceBrief, isWebStudioPrompt } from '../../_lib/experience.js';
import { buildPromptContract, getWebStudioBuildClarification } from '../../_lib/prompt-contract.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';
import {
  saveChatTurn,
  resolveConversationId,
} from '../../_lib/chat-history.js';

function parseStructured(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}


export async function onRequestPost(context) {
  try {
    const user = assertAuthenticated(
      context.data?.user
    );

    const payload = await readJson(
      context.request,
      300_000
    );

    const messages = Array.isArray(
      payload.messages
    )
      ? payload.messages
      : [
          {
            role: 'user',
            content: String(
              payload.prompt ||
                payload.message ||
                ''
            ),
          },
        ];

    if (
      !messages.length ||
      !String(
        messages[0]?.content || ''
      ).trim()
    ) {
      return errorResponse(
        400,
        'PROMPT_REQUIRED',
        'AI prompt is required.'
      );
    }

    const mode = String(payload.mode || 'assistant').toLowerCase();
    const hasStudioContext = !!(
      payload?.project ||
      payload?.files ||
      payload?.context?.project ||
      payload?.context?.files
    );
    const promptText =
      payload.prompt ||
      payload.message ||
      messages[messages.length - 1]?.content ||
      '';
    const activeView = String(payload.context?.activeView || '').replace(/^view-/i, '').trim().toLowerCase();
    const isAppStudio = activeView === 'appstudio' || ['appstudio', 'app-build', 'app-fix'].includes(mode);
    const isWebStudio = !isAppStudio && (isWebStudioPrompt(promptText, mode) ||
      ((mode === 'build' || mode === 'fix') && hasStudioContext));

    if (isAppStudio) {
      const entitlement = context.data?.entitlements || await resolveEntitlements(context.env, user);
      if (entitlement?.capabilities?.appStudio !== true) {
        return errorResponse('App Studio is not included in this account’s current server-authoritative feature access.', 403, 'FEATURE_NOT_INCLUDED');
      }
    }

    if (isWebStudio) {
      const entitlement = context.data?.entitlements || await resolveEntitlements(context.env, user);
      if (entitlement?.capabilities?.webStudio !== true) {
        return errorResponse('Web Studio is not included in this account’s current server-authoritative feature access.', 403, 'FEATURE_NOT_INCLUDED');
      }
    }

    const userTurns = messages
      .filter(item => item && item.role === 'user')
      .map(item => String(item.content || '').trim().slice(0, 30_000))
      .filter(Boolean)
      .slice(-12);
    const conversationText = userTurns.join('\n\n');
    const studioPromptText = isWebStudio && conversationText ? conversationText : String(promptText || '');
    const promptContract = isWebStudio ? buildPromptContract(studioPromptText) : null;

    const projectContext = payload.context && typeof payload.context === 'object'
      ? JSON.stringify(payload.context).slice(0, 80_000)
      : '';

    const experience = isWebStudio
      ? buildExperienceBrief(
          studioPromptText,
          payload.context || {}
        )
      : null;

    // For a fresh build, ask for essential public details or real integration
    // readiness before spending tokens on a site that could otherwise contain
    // invented contact data or pretend-live features. Existing-site edits stay fast.
    const studioFilesForReadiness = payload.context?.files || payload.files || {};
    const hasExistingHtml = Object.entries(studioFilesForReadiness && typeof studioFilesForReadiness === 'object' ? studioFilesForReadiness : {})
      .some(([path, value]) => {
        const text = typeof value === 'string' ? value : value && (value.content || value.text || value.source || value.code);
        return /\.html?$/i.test(path) && typeof text === 'string' && text.length > 500 && /<body\b/i.test(text);
      });
    const readinessSensitiveRequest =
      /\b(?:contact\s+forms?|enquir(?:y|ies)\s+forms?|email delivery|send (?:form )?messages|payments?|checkout|paystack|flutterwave|stripe|paypal|booking|reservations?|appointments?|newsletter|subscriptions?|login|log in|sign in|sign up|authentication|database|customer records?|order records?)\b/i.test(studioPromptText) ||
      /\b(?:add|create|include|build|put|make)\b.{0,55}\b(?:contact|email|phone|whatsapp|address|booking|reservation|newsletter)\b/i.test(studioPromptText);
    const isExistingSiteEdit = hasExistingHtml &&
      /\b(?:fix|edit|change|update|modify|repair|tweak|adjust|redesign|remove|replace|add)\b/i.test(String(studioPromptText || '')) &&
      !readinessSensitiveRequest;
    const buildReadiness = isWebStudio && mode === 'build' && !isExistingSiteEdit
      ? getWebStudioBuildClarification(studioPromptText, {
          ...(payload.context && typeof payload.context === 'object' ? payload.context : {}),
          conversationText,
        })
      : null;

    if (buildReadiness) {
      return json({
        ok: true,
        needsUserInput: true,
        type: buildReadiness.type,
        clarification: buildReadiness,
        text: buildReadiness.message,
        message: buildReadiness.message,
        answer: buildReadiness.message,
        experience,
      });
    }

    const suppliedSystem = String(payload.system || '').trim();

    const globalAIIdentityDirective = await getAIIdentityDirective(context.env);
    const system = String(
      isWebStudio
        ? WEB_STUDIO_SYSTEM_PROMPT +
          '\n\n' +
          WEB_STUDIO_EXCELLENCE +
          '\n\nEXPERIENCE INTELLIGENCE:\n' +
          JSON.stringify(experience || {}) +
          '\n\nPROMPT REQUIREMENT CONTRACT (preserve every item):\n' +
          JSON.stringify(promptContract || {}) +
          '\n\nPROMPT-FIDELITY RULES:\n' +
          '- Treat every explicit request, restriction and named page as a delivery contract. Do not silently omit requirements.\n' +
          '- For edits, inspect supplied project files and change only what the request needs; preserve unrelated working sections, routes and styling.\n' +
          '- Ask short questions when essential public details or a real integration are missing. If the user chooses placeholders or UI-only, proceed transparently without fake success states.\n' +
          '- Before you finish, compare the result against the full user brief and report any unavailable or pending integration honestly.\n' +
          (suppliedSystem
            ? '\n\nCLIENT STUDIO INSTRUCTIONS:\n' + suppliedSystem
            : '') +
          '\n\nAuthenticated user UID: ' + user.sub
        : suppliedSystem ||
          'You are OVYX Brain. Return useful, project-aware responses. Never reveal server secrets.'
    ).slice(0, isWebStudio ? 40_000 : 20_000) + '\n\n' + globalAIIdentityDirective;

    const combined = messages
      .slice(-12)
      .map(
        x =>
          `${x.role || 'user'}: ${String(
            x.content || ''
          ).slice(0, 30_000)}`
      )
      .join('\n\n');

    const conversationId = resolveConversationId(
      payload.conversationId
    );

    const currentRequestId = requestId(
      context.request
    );

    const quotaReservation = await beginAIQuota(context.env, user);

    let result;
    let multiPageBuild = false;
    let quotaInputText = isWebStudio && projectContext
      ? combined + '\n\nPROJECT CONTEXT:\n' + projectContext
      : combined;
    let quotaOutputText = '';

    try {
      if (isWebStudio && mode === 'build') {
        const project = payload.context?.project || payload.project || {};
        const projectFiles = payload.context?.files || payload.files || {};
        const studioHints = JSON.stringify({
          activeView: payload.context?.activeView || '',
          brandProfile: payload.context?.brandProfile || payload.context?.brand || null,
          theme: payload.context?.theme || null,
          viewport: payload.context?.viewport || null,
          promptContract,
        }).slice(0, 10000);

        const generated = await buildStudioMultiPage({
          env: context.env,
          callModel,
          provider: String(payload.provider || 'automatic').toLowerCase(),
          preferredProvider: String(payload.preferredProvider || ''),
          model: payload.model,
          authUser: user,
          prompt: studioPromptText,
          project,
          files: projectFiles,
          mode,
          context: studioHints,
          qualityContract: WEB_STUDIO_EXCELLENCE + '\n\n' + globalAIIdentityDirective,
        });

        if (generated) {
          result = generated;
          multiPageBuild = true;
          quotaInputText = generated.quotaInputText || quotaInputText;
          quotaOutputText = generated.quotaOutputText || generated.text || '';
        }
      }

      if (!result) {
        result = await callModel(
          context.env,
          {
            provider: String(payload.provider || 'automatic').toLowerCase(),
            preferredProvider: String(payload.preferredProvider || ''),
            taskPrompt: payload.prompt || payload.message || messages[messages.length - 1]?.content || '',
            model: payload.model,
            system,
            user: isWebStudio && projectContext ? combined + '\n\nPROJECT CONTEXT:\n' + projectContext : combined,
            authUser: user,
            maxTokens: isWebStudio
              ? Math.min(Number(payload.maxTokens || 24000), 24000)
              : Math.min(Number(payload.maxTokens || 4096), 8192),
          }
        );
        quotaOutputText = result.text || '';
      }
    } catch (providerError) {
      if (providerError?.partialUsage) {
        await finalizeAIQuota(
          context.env,
          quotaReservation,
          providerError.partialUsage,
          providerError.quotaInputText || quotaInputText,
          providerError.quotaOutputText || ''
        ).catch(quotaError => {
          console.error('[OVYX PARTIAL AI USAGE]', quotaError?.message || quotaError);
        });
      } else {
        await refundDailyPrompt(context.env, quotaReservation);
      }
      throw providerError;
    }

    const quota = await finalizeAIQuota(
      context.env,
      quotaReservation,
      result.rawUsage || null,
      quotaInputText,
      quotaOutputText || result.text || ''
    );

    let historySaved = false;

    try {
      await saveChatTurn({
        env: context.env,
        userId: user.sub,
        conversationId,
        messages,
        result,
        requestId: currentRequestId,
        requestedProvider: result.requestedProvider,
      });
      historySaved = true;
    } catch (historyError) {
      console.error(
        '[OVYX CHAT HISTORY]',
        historyError?.message || historyError
      );
    }

    const structured = isWebStudio ? parseStructured(result.text) : null;
    const structuredFields = {};
    if (structured && typeof structured === 'object') {
      for (const key of ['project', 'updatedProject', 'files', 'fileEdits', 'patch', 'html', 'code', 'summary', 'message', 'answer', 'requirementVerification']) {
        if (Object.prototype.hasOwnProperty.call(structured, key)) {
          structuredFields[key] = structured[key];
        }
      }
    }

    if (multiPageBuild) {
      structuredFields.files = result.files || {};
      if (result.project) structuredFields.project = result.project;
      structuredFields.summary = result.summary || structuredFields.summary;
      structuredFields.message = result.message || structuredFields.message;
      structuredFields.siteMap = result.siteMap || null;
      structuredFields.requirementVerification = result.requirementVerification || null;
    }

    return json({
      ok: true,
      text: result.text,
      message: result.text,
      answer: result.text,
      ...structuredFields,
      data: structured,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
      quota,
      requestedProvider: result.requestedProvider,
      routedProvider: result.routedProvider,
      conversationId,
      experience: isWebStudio ? experience : null,
      history: {
        saved: historySaved,
      },
    });
  } catch (err) {
    return errorResponse(
      err.status || 500,
      err.code || 'AI_GATEWAY_FAILED',
      err.message || 'AI gateway unavailable.'
    );
  }
      }