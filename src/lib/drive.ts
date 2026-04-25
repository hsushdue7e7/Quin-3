const getRawClientId = () => {
  try {
    const id = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (typeof process !== 'undefined' ? (process.env as any).VITE_GOOGLE_CLIENT_ID : undefined);
    if (!id) return '';
    // Remove quotes if they exist (common mistake in env vars)
    return id.toString().trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    return '';
  }
};

const CLIENT_ID = getRawClientId();
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID || CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID' || CLIENT_ID === '') {
    throw new Error('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your environment variables with a valid client ID from Google Cloud Console.');
  }

  if (!CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    throw new Error(`Invalid Google Client ID format: "${CLIENT_ID}". It must end with ".apps.googleusercontent.com". Please check your VITE_GOOGLE_CLIENT_ID environment variable in Settings.`);
  }

  return new Promise((resolve, reject) => {
    try {
      if (!(window as any).google?.accounts?.oauth2) {
        throw new Error('Google Identity Services script not loaded. Please refresh the page.');
      }

      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            console.error('Google OAuth error:', response);
            reject(new Error(`Google OAuth error: ${response.error_description || response.error}`));
          } else {
            resolve(response.access_token);
          }
        },
      });
      client.requestAccessToken();
    } catch (err: any) {
      reject(err);
    }
  });
}

export async function getUserInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

export async function uploadToDrive(accessToken: string, filename: string, content: string, fileId?: string) {
  const metadata = {
    name: filename,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const url = fileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  
  const response = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error('Failed to upload to Drive');
  }

  return response.json();
}

export async function listBackups(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType="application/json" and name contains "quin_backup"', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to list backups');
  }

  const data = await response.json();
  return data.files;
}

export async function downloadFromDrive(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to download backup');
  }

  return response.text();
}
