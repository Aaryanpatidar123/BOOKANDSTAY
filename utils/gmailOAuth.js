const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://mail.google.com/'];
const TOKEN_PATH = path.join(process.cwd(), '.gmail_tokens.json');

function createOAuth2Client(clientId, clientSecret, redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(clientId, clientSecret, redirectUri) {
  const oAuth2Client = createOAuth2Client(clientId, clientSecret, redirectUri);
  return oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function getTokensFromCode(clientId, clientSecret, redirectUri, code) {
  const oAuth2Client = createOAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await oAuth2Client.getToken(code);
  // Save minimal token info to .gmail_tokens.json so it persists across restarts
  const save = { tokens: { refresh_token: tokens.refresh_token, scope: tokens.scope, token_type: tokens.token_type } };
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(save, null, 2));
  } catch (e) {
    console.warn('Could not write gmail token file:', e && e.message ? e.message : e);
  }
  return tokens;
}

function loadSavedRefreshToken() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && parsed.tokens && parsed.tokens.refresh_token ? parsed.tokens.refresh_token : null;
  } catch (e) {
    console.warn('Failed to read saved gmail token:', e && e.message ? e.message : e);
    return null;
  }
}

module.exports = { getAuthUrl, getTokensFromCode, loadSavedRefreshToken, createOAuth2Client };
