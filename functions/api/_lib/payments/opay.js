'use strict';

/**
 * OVYX — OPay Server Adapter
 *
 * File:
 *   functions/api/_lib/payments/opay.js
 *
 * Responsibilities:
 *   - OPay RSA PKCS#1 v1.5 encryption
 *   - OPay RSA SHA-256 signing
 *   - OPay RSA SHA-256 response verification
 *   - OPay RSA PKCS#1 v1.5 response decryption
 *   - OPay encrypted API requests
 *   - OPay encrypted API responses
 *   - OPay create-order support
 *   - OPay order-status query support
 *
 * Security:
 *   - No OPay secret is ever returned to the browser.
 *   - No private key is logged.
 *   - No client supplied amount is trusted by this module.
 *
 * OPay documents:
 *   - RSA authentication
 *   - SHA256withRSA signatures
 *   - PKCS#1 encryption
 *   - clientAuthKey
 *   - V1.0.1
 *   - JSON body format
 *   - millisecond timestamps
 */

const DEFAULT_BASE_URL = 'https://payapi.opayweb.com';
const DEFAULT_API_VERSION = 'V1.0.1';
const DEFAULT_BODY_FORMAT = 'JSON';
const DEFAULT_TIMEOUT_MS = 15000;

const CREATE_ORDER_PATH = '/openApi/order/checkout/createOrder';
const QUERY_ORDER_PATH = '/openApi/order/checkout/qryOrderDetail';

function text(value) {
  return String(value == null ? '' : value);
}

function requiredString(value, name) {
  const result = text(value).trim();

  if (!result) {
    throw new Error(`${name} is not configured.`);
  }

  return result;
}

function normalizePem(value) {
  return text(value)
    .replace(/\r\n/g, '\n')
    .trim();
}

function base64ToBytes(value) {
  const normalized = text(value)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded =
    normalized +
    '='.repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(
      i,
      Math.min(i + chunkSize, bytes.length)
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function stringToBytes(value) {
  return new TextEncoder().encode(text(value));
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

function concatBytes(...arrays) {
  const total = arrays.reduce(
    (sum, value) => sum + value.length,
    0
  );

  const result = new Uint8Array(total);

  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* DER / ASN.1                                                                  */
/* -------------------------------------------------------------------------- */

function readDerLength(bytes, offset) {
  if (offset >= bytes.length) {
    throw new Error('Invalid DER length.');
  }

  const first = bytes[offset];

  if ((first & 0x80) === 0) {
    return {
      length: first,
      offset: offset + 1
    };
  }

  const count = first & 0x7f;

  if (count === 0 || count > 4) {
    throw new Error('Unsupported DER length.');
  }

  if (offset + 1 + count > bytes.length) {
    throw new Error('Invalid DER length.');
  }

  let length = 0;

  for (let i = 0; i < count; i += 1) {
    length = (length * 256) + bytes[offset + 1 + i];
  }

  return {
    length,
    offset: offset + 1 + count
  };
}

function readDerElement(bytes, offset) {
  if (offset >= bytes.length) {
    throw new Error('Invalid DER element.');
  }

  const tag = bytes[offset];

  const lengthInfo = readDerLength(
    bytes,
    offset + 1
  );

  const start = lengthInfo.offset;
  const end = start + lengthInfo.length;

  if (end > bytes.length) {
    throw new Error('DER element exceeds input.');
  }

  return {
    tag,
    start,
    end,
    value: bytes.subarray(start, end),
    nextOffset: end
  };
}

function parseDerChildren(sequenceBytes) {
  const children = [];

  let offset = 0;

  while (offset < sequenceBytes.length) {
    const element = readDerElement(
      sequenceBytes,
      offset
    );

    children.push(element);
    offset = element.nextOffset;
  }

  return children;
}

function integerBytesToBigInt(bytes) {
  let value = bytes;

  while (
    value.length > 1 &&
    value[0] === 0
  ) {
    value = value.subarray(1);
  }

  let hex = '';

  for (const byte of value) {
    hex += byte
      .toString(16)
      .padStart(2, '0');
  }

  return BigInt(`0x${hex || '0'}`);
}

function pemToDer(pem) {
  const normalized = normalizePem(pem);

  const body = normalized
    .replace(
      /-----BEGIN [^-]+-----/g,
      ''
    )
    .replace(
      /-----END [^-]+-----/g,
      ''
    )
    .replace(/\s+/g, '');

  if (!body) {
    throw new Error('PEM value is empty.');
  }

  return base64ToBytes(body);
}

function parsePublicKey(pem) {
  const der = pemToDer(pem);

  const root = readDerElement(
    der,
    0
  );

  if (root.tag !== 0x30) {
    throw new Error('Invalid public key DER sequence.');
  }

  const children = parseDerChildren(
    root.value
  );

  /*
   * SubjectPublicKeyInfo:
   *
   * SEQUENCE
   *   SEQUENCE algorithm
   *   BIT STRING containing:
   *      SEQUENCE
   *        INTEGER modulus
   *        INTEGER exponent
   */

  if (
    children.length < 2 ||
    children[1].tag !== 0x03
  ) {
    throw new Error(
      'Unsupported public key format. Expected SubjectPublicKeyInfo.'
    );
  }

  const bitString = children[1].value;

  if (
    bitString.length < 2 ||
    bitString[0] !== 0
  ) {
    throw new Error(
      'Invalid public key bit string.'
    );
  }

  const rsaDer = bitString.subarray(1);

  const rsaSequence = readDerElement(
    rsaDer,
    0
  );

  if (rsaSequence.tag !== 0x30) {
    throw new Error(
      'Invalid RSA public key sequence.'
    );
  }

  const rsaChildren = parseDerChildren(
    rsaSequence.value
  );

  if (rsaChildren.length < 2) {
    throw new Error(
      'RSA public key is incomplete.'
    );
  }

  return {
    modulus: integerBytesToBigInt(
      rsaChildren[0].value
    ),
    exponent: integerBytesToBigInt(
      rsaChildren[1].value
    )
  };
}

function parsePrivateKey(pem) {
  const normalized = normalizePem(pem);

  const der = pemToDer(normalized);

  const root = readDerElement(
    der,
    0
  );

  if (root.tag !== 0x30) {
    throw new Error(
      'Invalid private key DER sequence.'
    );
  }

  const children = parseDerChildren(
    root.value
  );

  /*
   * PKCS#1:
   *
   * SEQUENCE
   *   version
   *   modulus
   *   publicExponent
   *   privateExponent
   *   ...
   *
   * PKCS#8:
   *
   * SEQUENCE
   *   version
   *   algorithm
   *   OCTET STRING containing PKCS#1
   */

  let rsaSequence;

  if (
    children.length >= 4 &&
    children[0].tag === 0x02 &&
    children[1].tag === 0x02 &&
    children[2].tag === 0x02
  ) {
    rsaSequence = root;
  } else {
    const privateOctet = children.find(
      element => element.tag === 0x04
    );

    if (!privateOctet) {
      throw new Error(
        'Unsupported private key format.'
      );
    }

    rsaSequence = readDerElement(
      privateOctet.value,
      0
    );
  }

  if (rsaSequence.tag !== 0x30) {
    throw new Error(
      'Invalid RSA private key sequence.'
    );
  }

  const rsaChildren = parseDerChildren(
    rsaSequence.value
  );

  if (rsaChildren.length < 4) {
    throw new Error(
      'RSA private key is incomplete.'
    );
  }

  return {
    modulus: integerBytesToBigInt(
      rsaChildren[1].value
    ),
    publicExponent: integerBytesToBigInt(
      rsaChildren[2].value
    ),
    privateExponent: integerBytesToBigInt(
      rsaChildren[3].value
    )
  };
}

/* -------------------------------------------------------------------------- */
/* BigInt RSA                                                                   */
/* -------------------------------------------------------------------------- */

function modPow(base, exponent, modulus) {
  if (modulus <= 0n) {
    throw new Error(
      'RSA modulus must be positive.'
    );
  }

  let result = 1n;
  let current = base % modulus;
  let power = exponent;

  while (power > 0n) {
    if (power & 1n) {
      result = (result * current) % modulus;
    }

    current =
      (current * current) % modulus;

    power >>= 1n;
  }

  return result;
}

function bigIntToFixedBytes(value, length) {
  let hex = value.toString(16);

  if (hex.length % 2) {
    hex = `0${hex}`;
  }

  const bytes = new Uint8Array(
    hex.length / 2
  );

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );
  }

  if (bytes.length > length) {
    throw new Error(
      'RSA integer is larger than modulus.'
    );
  }

  if (bytes.length === length) {
    return bytes;
  }

  const result = new Uint8Array(length);

  result.set(
    bytes,
    length - bytes.length
  );

  return result;
}

function rsaEncryptPkcs1(messageBytes, publicKey) {
  const modulusLength = Math.ceil(
    publicKey.modulus.toString(2).length / 8
  );

  if (
    messageBytes.length >
    modulusLength - 11
  ) {
    throw new Error(
      `OPay RSA payload is too large for the configured key. Maximum plaintext is ${modulusLength - 11} bytes.`
    );
  }

  const paddingLength =
    modulusLength -
    messageBytes.length -
    3;

  const padding = new Uint8Array(
    paddingLength
  );

  /*
   * PKCS#1 v1.5 encryption requires
   * non-zero random padding bytes.
   */

  for (let i = 0; i < padding.length; i += 1) {
    let byte = 0;

    while (byte === 0) {
      byte =
        crypto.getRandomValues(
          new Uint8Array(1)
        )[0];
    }

    padding[i] = byte;
  }

  const encoded = concatBytes(
    new Uint8Array([0x00, 0x02]),
    padding,
    new Uint8Array([0x00]),
    messageBytes
  );

  const integer = bytesToBigInt(encoded);

  const encryptedInteger = modPow(
    integer,
    publicKey.exponent,
    publicKey.modulus
  );

  return bigIntToFixedBytes(
    encryptedInteger,
    modulusLength
  );
}

function rsaDecryptPkcs1(cipherBytes, privateKey) {
  const modulusLength = Math.ceil(
    privateKey.modulus.toString(2).length / 8
  );

  if (
    cipherBytes.length !== modulusLength
  ) {
    throw new Error(
      'Invalid RSA ciphertext length.'
    );
  }

  const cipherInteger =
    bytesToBigInt(cipherBytes);

  if (
    cipherInteger >= privateKey.modulus
  ) {
    throw new Error(
      'RSA ciphertext is outside modulus.'
    );
  }

  const messageInteger = modPow(
    cipherInteger,
    privateKey.privateExponent,
    privateKey.modulus
  );

  const encoded = bigIntToFixedBytes(
    messageInteger,
    modulusLength
  );

  if (
    encoded[0] !== 0x00 ||
    encoded[1] !== 0x02
  ) {
    throw new Error(
      'Invalid RSA PKCS#1 encryption block.'
    );
  }

  let separator = -1;

  for (
    let i = 2;
    i < encoded.length;
    i += 1
  ) {
    if (encoded[i] === 0x00) {
      separator = i;
      break;
    }
  }

  if (
    separator < 10 ||
    separator === encoded.length - 1
  ) {
    throw new Error(
      'Invalid RSA PKCS#1 padding.'
    );
  }

  return encoded.subarray(
    separator + 1
  );
}

function bytesToBigInt(bytes) {
  let hex = '';

  for (const byte of bytes) {
    hex += byte
      .toString(16)
      .padStart(2, '0');
  }

  return BigInt(`0x${hex || '0'}`);
}

/* -------------------------------------------------------------------------- */
/* WebCrypto signatures                                                         */
/* -------------------------------------------------------------------------- */

async function importPrivateSigningKey(pem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

async function importPublicVerifyKey(pem) {
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  );
}

async function signSha256Rsa(
  value,
  privateKeyPem
) {
  const key =
    await importPrivateSigningKey(
      privateKeyPem
    );

  const signature =
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      stringToBytes(value)
    );

  return bytesToBase64(
    new Uint8Array(signature)
  );
}

async function verifySha256Rsa(
  value,
  signatureBase64,
  publicKeyPem
) {
  const key =
    await importPublicVerifyKey(
      publicKeyPem
    );

  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64ToBytes(signatureBase64),
    stringToBytes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* OPay canonicalization                                                        */
/* -------------------------------------------------------------------------- */

function sortObject(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => sortObject(item))
      .sort((a, b) =>
        JSON.stringify(a).localeCompare(
          JSON.stringify(b)
        )
      );
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const result = {};

    for (
      const key of Object.keys(value).sort()
    ) {
      result[key] = sortObject(
        value[key]
      );
    }

    return result;
  }

  return value;
}

function canonicalObjectString(value) {
  const sorted = sortObject(value);

  const parts = [];

  for (
    const key of Object.keys(sorted)
  ) {
    let current = sorted[key];

    if (
      current &&
      typeof current === 'object'
    ) {
      current = JSON.stringify(
        current
      );
    }

    parts.push(
      `${key}=${text(current)}`
    );
  }

  return parts.join('&');
}

/* -------------------------------------------------------------------------- */
/* Environment configuration                                                    */
/* -------------------------------------------------------------------------- */

function getConfig(env) {
  const baseUrl =
    text(
      env.OPAY_API_BASE_URL ||
      DEFAULT_BASE_URL
    )
      .trim()
      .replace(/\/+$/, '');

  const clientAuthKey =
    requiredString(
      env.OPAY_CLIENT_AUTH_KEY,
      'OPAY_CLIENT_AUTH_KEY'
    );

  const headMerchantId =
    requiredString(
      env.OPAY_HEAD_MERCHANT_ID,
      'OPAY_HEAD_MERCHANT_ID'
    );

  const merchantId =
    requiredString(
      env.OPAY_MERCHANT_ID,
      'OPAY_MERCHANT_ID'
    );

  const privateKey =
    requiredString(
      env.OPAY_PRIVATE_KEY,
      'OPAY_PRIVATE_KEY'
    );

  const publicKey =
    requiredString(
      env.OPAY_PUBLIC_KEY,
      'OPAY_PUBLIC_KEY'
    );

  return {
    baseUrl,
    clientAuthKey,
    headMerchantId,
    merchantId,
    privateKey: normalizePem(
      privateKey
    ),
    publicKey: normalizePem(
      publicKey
    ),
    version:
      text(
        env.OPAY_API_VERSION ||
        DEFAULT_API_VERSION
      ).trim(),
    bodyFormat:
      text(
        env.OPAY_BODY_FORMAT ||
        DEFAULT_BODY_FORMAT
      ).trim(),
    timeoutMs: Math.max(
      1000,
      Number(
        env.OPAY_API_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS
      )
    )
  };
}

/* -------------------------------------------------------------------------- */
/* Request / response envelopes                                                */
/* -------------------------------------------------------------------------- */

async function buildEncryptedRequest(
  env,
  payload,
  timestamp = Date.now()
) {
  const config = getConfig(env);

  const normalizedPayload =
    sortObject(payload);

  const plaintext =
    JSON.stringify(
      normalizedPayload
    );

  const opayPublicKey =
    parsePublicKey(
      config.publicKey
    );

  const encryptedBytes =
    rsaEncryptPkcs1(
      stringToBytes(plaintext),
      opayPublicKey
    );

  const paramContent =
    bytesToBase64(
      encryptedBytes
    );

  const sign =
    await signSha256Rsa(
      `${paramContent}${timestamp}`,
      config.privateKey
    );

  return {
    timestamp: String(timestamp),
    envelope: {
      paramContent,
      sign
    },
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      version: config.version,
      bodyFormat: config.bodyFormat,
      clientAuthKey:
        config.clientAuthKey,
      timestamp: String(timestamp)
    }
  };
}

async function decryptResponse(
  env,
  responseEnvelope
) {
  const config = getConfig(env);

  if (
    !responseEnvelope ||
    typeof responseEnvelope !== 'object'
  ) {
    throw new Error(
      'OPay returned an invalid response envelope.'
    );
  }

  const {
    code,
    message,
    sign,
    timestamp,
    data
  } = responseEnvelope;

  if (
    !text(sign).trim() ||
    !text(timestamp).trim() ||
    !text(data).trim()
  ) {
    throw new Error(
      'OPay response is missing required authentication fields.'
    );
  }

  /*
   * OPay's documented response signature covers
   * the response envelope fields excluding sign.
   */

  const verificationPayload = {
    code: text(code),
    message: text(message),
    timestamp: text(timestamp),
    data: text(data)
  };

  const canonical =
    canonicalObjectString(
      verificationPayload
    );

  const signatureValid =
    await verifySha256Rsa(
      canonical,
      text(sign),
      config.publicKey
    );

  if (!signatureValid) {
    throw new Error(
      'OPay response signature verification failed.'
    );
  }

  const merchantPrivateKey =
    parsePrivateKey(
      config.privateKey
    );

  const decryptedBytes =
    rsaDecryptPkcs1(
      base64ToBytes(data),
      merchantPrivateKey
    );

  let decrypted;

  try {
    decrypted = JSON.parse(
      bytesToString(
        decryptedBytes
      )
    );
  } catch {
    throw new Error(
      'OPay response payload could not be decrypted as JSON.'
    );
  }

  return {
    code: text(code),
    message: text(message),
    timestamp: text(timestamp),
    data: decrypted,
    signatureValid: true
  };
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                        */
/* -------------------------------------------------------------------------- */

async function opayRequest(
  env,
  path,
  payload
) {
  const config = getConfig(env);

  const {
    envelope,
    headers
  } =
    await buildEncryptedRequest(
      env,
      payload
    );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      config.timeoutMs
    );

  let response;

  try {
    response = await fetch(
      `${config.baseUrl}${path}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(
          envelope
        ),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (
      error &&
      error.name === 'AbortError'
    ) {
      throw new Error(
        'OPay request timed out.'
      );
    }

    throw new Error(
      'Unable to connect to OPay.'
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText =
    await response.text();

  let rawPayload;

  try {
    rawPayload =
      JSON.parse(rawText);
  } catch {
    throw new Error(
      'OPay returned a non-JSON response.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `OPay HTTP ${response.status}: ${
        text(rawPayload.message) ||
        'Request failed.'
      }`
    );
  }

  const result =
    await decryptResponse(
      env,
      rawPayload
    );

  return result;
}

/* -------------------------------------------------------------------------- */
/* Public payment operations                                                   */
/* -------------------------------------------------------------------------- */

async function createOrder(
  env,
  {
    outOrderNo,
    amount,
    currency = 'NGN',
    orderExpireTime = 180,
    productInfo = '',
    remark = '',
    sceneEnum,
    subSceneEnum,
    sn,
    isSplit = 'N',
    splitInfo = null
  }
) {
  const config = getConfig(env);

  const orderNumber =
    requiredString(
      outOrderNo,
      'outOrderNo'
    );

  const normalizedAmount =
    Number(amount);

  if (
    !Number.isFinite(
      normalizedAmount
    ) ||
    normalizedAmount <= 0
  ) {
    throw new Error(
      'OPay order amount must be greater than zero.'
    );
  }

  if (
    String(currency).toUpperCase() !==
    'NGN'
  ) {
    throw new Error(
      'The configured OPay collection adapter currently accepts NGN only.'
    );
  }

  const payload = {
    headMerchantId:
      config.headMerchantId,

    merchantId:
      config.merchantId,

    outOrderNo:
      orderNumber,

    amount:
      normalizedAmount.toFixed(2),

    currency: 'NGN',

    orderExpireTime:
      Math.max(
        60,
        Math.floor(
          Number(orderExpireTime)
        )
      ),

    isSplit:
      isSplit === 'Y'
        ? 'Y'
        : 'N',

    splitInfo:
      isSplit === 'Y'
        ? splitInfo
        : null,

    productInfo:
      typeof productInfo ===
      'object'
        ? JSON.stringify(
            productInfo
          )
        : text(productInfo),

    remark:
      text(remark)
  };

  if (sceneEnum) {
    payload.sceneEnum =
      text(sceneEnum);
  }

  if (subSceneEnum) {
    payload.subSceneEnum =
      text(subSceneEnum);
  }

  if (sn) {
    payload.sn = text(sn);
  }

  const result =
    await opayRequest(
      env,
      CREATE_ORDER_PATH,
      payload
    );

  if (result.code !== '00000') {
    throw new Error(
      `OPay order creation failed: ${
        result.message ||
        result.code
      }`
    );
  }

  return {
    ...result,
    outOrderNo:
      orderNumber,
    orderNo:
      text(
        result.data?.orderNo
      )
  };
}

async function queryOrder(
  env,
  {
    outOrderNo,
    orderNo
  }
) {
  const config = getConfig(env);

  const externalOrder =
    text(outOrderNo).trim();

  const opayOrder =
    text(orderNo).trim();

  if (
    !externalOrder &&
    !opayOrder
  ) {
    throw new Error(
      'Either outOrderNo or orderNo is required.'
    );
  }

  const payload = {
    headMerchantId:
      config.headMerchantId,

    merchantId:
      config.merchantId
  };

  if (externalOrder) {
    payload.outOrderNo =
      externalOrder;
  }

  if (opayOrder) {
    payload.orderNo =
      opayOrder;
  }

  const result =
    await opayRequest(
      env,
      QUERY_ORDER_PATH,
      payload
    );

  return result;
}

function normalizeOpayStatus(
  value
) {
  const status =
    text(value)
      .trim()
      .toUpperCase();

  if (
    status === 'SUCCESS'
  ) {
    return 'success';
  }

  if (
    status === 'PENDING'
  ) {
    return 'pending';
  }

  if (
    status === 'FAIL'
  ) {
    return 'failed';
  }

  if (
    status === 'CLOSE'
  ) {
    return 'closed';
  }

  if (
    status === 'CANCEL'
  ) {
    return 'canceled';
  }

  return 'unknown';
}

module.exports = {
  DEFAULT_BASE_URL,
  CREATE_ORDER_PATH,
  QUERY_ORDER_PATH,
  getConfig,
  sortObject,
  canonicalObjectString,
  buildEncryptedRequest,
  decryptResponse,
  opayRequest,
  createOrder,
  queryOrder,
  normalizeOpayStatus
};
