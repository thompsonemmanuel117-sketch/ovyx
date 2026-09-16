import { jsonResponse, errorResponse } from '../_lib/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Set up un-cacheable secure network headers
  const secureHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "X-Content-Type-Options": "nosniff"
  };

  try {
    // 1. Extract Bearer token from headers
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing identity clearance credentials" }), {
        status: 401, headers: secureHeaders
      });
    }
    const idToken = authHeader.split("Bearer ")[1];

    // 2. Query Firebase Auth to confirm user identity server-side
    const verifyUrl = `https://googleapis.com{env.FIREBASE_WEB_API_KEY}`;
    const firebaseResponse = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    });

    const userData = await firebaseResponse.json();
    if (!firebaseResponse.ok || !userData.users || userData.users.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid administrative credentials session" }), {
        status: 403, headers: secureHeaders
      });
    }

    // 3. HARD IDENTITY CHECK: Enforce that only your master owner account passes
    const verifiedEmail = userData.users[0].email;
    if (verifiedEmail !== "ovyxsupportteam@gmail.com") {
      return new Response(JSON.stringify({ error: "Access Denied: Account lacks ROOT_SUPERUSER privileges" }), {
        status: 403, headers: secureHeaders
      });
    }

    // 4. Server-Side Firestore Logs Query fetch execution
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
    const firestoreUrl = `https://googleapis.com{projectId}/databases/(default)/documents/audit_logs?pageSize=50`;
    
    const dbResponse = await fetch(firestoreUrl);
    const dbData = await dbResponse.json();

    // Map out and clean the logs format array cleanly for the client grid terminal view
    const formattedLogs = (dbData.documents || []).map(doc => {
      const fields = doc.fields || {};
      return {
        user: fields.user?.stringValue || 'N/A',
        action: fields.action?.stringValue || 'UNKNOWN',
        resource: fields.resource?.stringValue || 'SYSTEM',
        timestamp: fields.timestamp?.stringValue || '',
        requestId: fields.requestId?.stringValue || '',
        ipAddress: fields.ipAddress?.stringValue || '',
        result: fields.result?.stringValue || 'SUCCESS'
      };
    });

    return new Response(JSON.stringify({ logs: formattedLogs }), {
      status: 200, headers: secureHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to pull administrative log stream context", details: error.message }), {
      status: 500, headers: secureHeaders
    });
  }
         }
                                       
