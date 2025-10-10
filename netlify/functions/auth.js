const { Octokit } = require('@octokit/rest');

exports.handler = async (event, context) => {
  const { httpMethod, path, queryStringParameters } = event;
  
  if (httpMethod === 'GET' && path.endsWith('/auth')) {
    // Redirect to GitHub OAuth
    const clientId = process.env.OAUTH_CLIENT_ID;
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    const scope = process.env.GITHUB_SCOPE || 'repo';
    
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    
    return {
      statusCode: 302,
      headers: {
        Location: authUrl
      }
    };
  }
  
  if (httpMethod === 'GET' && path.endsWith('/auth/callback')) {
    const { code } = queryStringParameters;
    
    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing authorization code' })
      };
    }
    
    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: process.env.OAUTH_CLIENT_ID,
          client_secret: process.env.OAUTH_CLIENT_SECRET,
          code: code
        })
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: tokenData.error_description })
        };
      }
      
      // Get user info
      const octokit = new Octokit({ auth: tokenData.access_token });
      const { data: user } = await octokit.rest.users.getAuthenticated();
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: tokenData.access_token,
          user: user
        })
      };
      
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Authentication failed' })
      };
    }
  }
  
  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Not found' })
  };
};
