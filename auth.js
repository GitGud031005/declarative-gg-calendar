import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import { google } from 'googleapis';

const TOKEN_PATH = path.resolve('token.json');
const CREDENTIALS_PATH = path.resolve('credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Loads credentials, asks user to authenticate if not done, and returns the OAuth2 client.
 */
export async function getAuthClient() {
  let credentials;
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    credentials = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Could not load client secrets from '${CREDENTIALS_PATH}'. Please follow SETUP.md to create it.`
    );
  }

  // Support both "web" and "installed" types of client credentials
  const clientType = credentials.installed ? 'installed' : 'web';
  if (!credentials[clientType]) {
    throw new Error(`Invalid credentials format. Expected key '${clientType}' in credentials.json.`);
  }

  const { client_secret, client_id } = credentials[clientType];
  
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost' // Will be updated dynamically with the actual port
  );

  // Check if we have a saved token
  try {
    const tokenContent = await fs.readFile(TOKEN_PATH, 'utf8');
    const token = JSON.parse(tokenContent);
    oAuth2Client.setCredentials(token);
    
    // Register listener to save updated tokens (e.g. after refresh)
    oAuth2Client.on('tokens', async (tokens) => {
      try {
        const existingTokenContent = await fs.readFile(TOKEN_PATH, 'utf8').catch(() => '{}');
        const existingToken = JSON.parse(existingTokenContent);
        const updatedToken = { ...existingToken, ...tokens };
        await fs.writeFile(TOKEN_PATH, JSON.stringify(updatedToken, null, 2));
      } catch (e) {
        console.warn('Warning: Could not save auto-refreshed token:', e.message);
      }
    });
    
    return oAuth2Client;
  } catch (err) {
    // If no token exists, trigger OAuth authorization code flow
    return new Promise((resolve, reject) => {
      // Start a temporary HTTP server to receive the authorization code redirect
      const server = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          const code = urlObj.searchParams.get('code');
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background: #f4f7f6;">
                  <div style="display: inline-block; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <h1 style="color: #2e7d32;">Authentication Successful!</h1>
                    <p style="color: #555;">You can now close this browser tab and return to the terminal.</p>
                  </div>
                </body>
              </html>
            `);
            
            server.close();
            
            // Exchange authorization code for tokens
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            console.log('Token stored to', TOKEN_PATH);
            resolve(oAuth2Client);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Authorization code missing in request');
          }
        } catch (authErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Authentication error: ${authErr.message}`);
          server.close();
          reject(authErr);
        }
      });

      // Listen on an ephemeral port (port 0 lets the OS pick a free port)
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        // Update redirect URI to matching local port
        oAuth2Client.redirectUri = `http://localhost:${port}`;
        
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline', // crucial for getting refresh_token
          scope: SCOPES,
          prompt: 'consent' // force consent screen to always get refresh_token
        });
        
        console.log('\n==================================================');
        console.log('AUTHORIZATION REQUIRED');
        console.log('Please open the following link in your browser to authorize this application:');
        console.log('\x1b[36m%s\x1b[0m', authUrl);
        console.log('==================================================\n');
      });
    });
  }
}

// Handle direct script execution
const isDirectRun = process.argv[1] && (
  process.argv[1] === import.meta.filename || 
  process.argv[1].endsWith('auth.js')
);

if (isDirectRun) {
  console.log('Initializing authentication...');
  getAuthClient()
    .then(() => {
      console.log('Authentication setup complete and verified!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Authentication failed:', err.message);
      process.exit(1);
    });
}
