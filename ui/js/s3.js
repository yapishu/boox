// S3 upload using system %storage credentials
// Uses presigned URLs (AWS Signature V4) for uploads

window.S3Upload = {
  config: null,

  async loadConfig() {
    this.config = await BooxAPI.getS3Config();
    return this.config;
  },

  generateKey(filename) {
    const ts = Date.now();
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `boox/${ts}-${safe}`;
  },

  async upload(file, onProgress) {
    const config = await this.loadConfig();
    if (!config.accessKeyId || !config.bucket) {
      throw new Error('S3 not configured. Set up storage credentials in Landscape System Preferences.');
    }

    const key = this.generateKey(file.name);
    const contentType = file.type || 'application/octet-stream';
    const endpoint = config.endpoint || `https://s3.${config.region || 'us-east-1'}.amazonaws.com`;

    const presignedUrl = await this.createPresignedUrl({
      endpoint,
      bucket: config.bucket,
      key,
      region: config.region || 'us-east-1',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      contentType,
    });

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('Cache-Control', 'public, max-age=3600');
      xhr.setRequestHeader('x-amz-acl', 'public-read');

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let url;
          if (config.publicUrlBase) {
            url = `${config.publicUrlBase}/${key}`;
          } else {
            url = `${endpoint}/${config.bucket}/${key}`;
          }
          resolve({ url, key });
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed: network error'));
      xhr.send(file);
    });
  },

  async createPresignedUrl({ endpoint, bucket, key, region, accessKeyId, secretAccessKey, contentType }) {
    const url = new URL(`${endpoint}/${bucket}/${key}`);
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const dateShort = dateStr.slice(0, 8);
    const scope = `${dateShort}/${region}/s3/aws4_request`;

    const signedHeaders = 'cache-control;content-type;host;x-amz-acl';

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${accessKeyId}/${scope}`);
    url.searchParams.set('X-Amz-Date', dateStr);
    url.searchParams.set('X-Amz-Expires', '3600');
    url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);

    const sortedParams = [...url.searchParams.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonicalQueryString = sortedParams
      .map(([k, v]) => `${this.uriEncode(k)}=${this.uriEncode(v)}`)
      .join('&');

    const canonicalHeaders =
      `cache-control:public, max-age=3600\n` +
      `content-type:${contentType}\n` +
      `host:${url.host}\n` +
      `x-amz-acl:public-read\n`;

    const canonicalRequest = [
      'PUT',
      url.pathname,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      dateStr,
      scope,
      await this.sha256hex(canonicalRequest),
    ].join('\n');

    const signingKey = await this.getSignatureKey(secretAccessKey, dateShort, region, 's3');
    const signature = await this.hmacHex(signingKey, stringToSign);

    url.searchParams.set('X-Amz-Signature', signature);
    return url.toString();
  },

  uriEncode(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase()
    );
  },

  async hmac(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key instanceof ArrayBuffer ? key : new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  },

  async hmacHex(key, data) {
    const sig = await this.hmac(key, data);
    return Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  async sha256hex(data) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  async deleteObject(objectUrl) {
    const config = await this.loadConfig();
    if (!config.accessKeyId || !config.bucket) return;

    // Extract the key from the URL
    let key;
    if (config.publicUrlBase && objectUrl.startsWith(config.publicUrlBase)) {
      key = objectUrl.slice(config.publicUrlBase.length + 1);
    } else {
      const endpoint = config.endpoint || `https://s3.${config.region || 'us-east-1'}.amazonaws.com`;
      const prefix = `${endpoint}/${config.bucket}/`;
      if (objectUrl.startsWith(prefix)) {
        key = objectUrl.slice(prefix.length);
      } else {
        return; // can't determine key
      }
    }

    const endpoint = config.endpoint || `https://s3.${config.region || 'us-east-1'}.amazonaws.com`;
    const region = config.region || 'us-east-1';
    const url = new URL(`${endpoint}/${config.bucket}/${key}`);
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const dateShort = dateStr.slice(0, 8);
    const scope = `${dateShort}/${region}/s3/aws4_request`;
    const signedHeaders = 'host';

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${config.accessKeyId}/${scope}`);
    url.searchParams.set('X-Amz-Date', dateStr);
    url.searchParams.set('X-Amz-Expires', '3600');
    url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);

    const sortedParams = [...url.searchParams.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonicalQueryString = sortedParams
      .map(([k, v]) => `${this.uriEncode(k)}=${this.uriEncode(v)}`)
      .join('&');

    const canonicalHeaders = `host:${url.host}\n`;
    const canonicalRequest = [
      'DELETE', url.pathname, canonicalQueryString,
      canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256', dateStr, scope,
      await this.sha256hex(canonicalRequest),
    ].join('\n');

    const signingKey = await this.getSignatureKey(config.secretAccessKey, dateShort, region, 's3');
    const signature = await this.hmacHex(signingKey, stringToSign);
    url.searchParams.set('X-Amz-Signature', signature);

    await fetch(url.toString(), { method: 'DELETE' });
  },

  async getSignatureKey(key, dateStamp, region, service) {
    let k = await this.hmac('AWS4' + key, dateStamp);
    k = await this.hmac(k, region);
    k = await this.hmac(k, service);
    k = await this.hmac(k, 'aws4_request');
    return k;
  },
};
