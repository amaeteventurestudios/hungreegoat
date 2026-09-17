// YouTubeLive.js — YouTube Live chat integration
// Uses YouTube Data API v3 (free tier) to poll liveChatMessages

export class YouTubeLive {
    constructor(onChatMessage, onSongRequest, onCommand) {
        this.apiKey = null;
        this.videoId = null;
        this.liveChatId = null;
        this.isConnected = false;
        this.pollTimer = null;
        this.nextPageToken = null;
        this.pollIntervalMs = 6000;
        this.viewerCount = 0;

        this.onChatMessage = onChatMessage || (() => {});
        this.onSongRequest = onSongRequest || (() => {});
        this.onCommand = onCommand || (() => {});
        this.onConnectionChange = () => {};
        this.onViewerCount = () => {};
        this.onError = () => {};

        this.nowPlaying = { title: '', artist: '' };
        this.requestQueue = [];
        this.maxRequests = 25;
    }

    async connect(videoId, apiKey) {
        this.videoId = videoId.trim();
        this.apiKey = apiKey.trim();

        if (!this.apiKey || !this.videoId) {
            this.onError('Both Video ID and API Key are required');
            return;
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${encodeURIComponent(this.videoId)}&key=${encodeURIComponent(this.apiKey)}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                this.onError('YouTube API error: ' + (err.error?.message || resp.statusText));
                return;
            }

            const data = await resp.json();
            if (!data.items || data.items.length === 0) {
                this.onError('Video not found');
                return;
            }

            const chatId = data.items[0].liveStreamingDetails?.activeLiveChatId;
            if (!chatId) {
                this.onError('No active live chat found. Is the stream live?');
                return;
            }

            this.liveChatId = chatId;
            this.isConnected = true;
            this.nextPageToken = null;
            this.onConnectionChange(true, this.videoId);
            this._pollChat();
        } catch (e) {
            this.onError('Connection failed: ' + e.message);
        }
    }

    disconnect() {
        clearTimeout(this.pollTimer);
        this.isConnected = false;
        this.liveChatId = null;
        this.nextPageToken = null;
        this.onConnectionChange(false, this.videoId);
    }

    setNowPlaying(title, artist) { this.nowPlaying = { title, artist }; }
    getRequestQueue() { return [...this.requestQueue]; }
    clearRequestQueue() { this.requestQueue = []; }
    removeRequest(index) {
        return (index >= 0 && index < this.requestQueue.length) ? this.requestQueue.splice(index, 1)[0] : null;
    }

    async _pollChat() {
        if (!this.isConnected || !this.liveChatId) return;

        try {
            let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(this.liveChatId)}&part=snippet,authorDetails&key=${encodeURIComponent(this.apiKey)}`;
            if (this.nextPageToken) url += `&pageToken=${encodeURIComponent(this.nextPageToken)}`;

            const resp = await fetch(url);
            if (!resp.ok) {
                if (resp.status === 403) { this.onError('API quota exceeded or chat ended'); this.disconnect(); return; }
                this.pollTimer = setTimeout(() => this._pollChat(), this.pollIntervalMs);
                return;
            }

            const data = await resp.json();
            this.nextPageToken = data.nextPageToken || null;
            if (data.pollingIntervalMillis) this.pollIntervalMs = Math.max(data.pollingIntervalMillis, 3000);

            if (data.items) {
                for (const item of data.items) this._processMessage(item);
            }
        } catch (e) {
            console.warn('YouTubeLive: Poll error:', e);
        }

        if (this.isConnected) {
            this.pollTimer = setTimeout(() => this._pollChat(), this.pollIntervalMs);
        }
    }

    _processMessage(item) {
        const snippet = item.snippet;
        const author = item.authorDetails;
        if (snippet.type !== 'textMessageEvent') return;

        const message = snippet.displayMessage || '';
        const user = author.displayName || 'Anonymous';
        const msgLower = message.trim().toLowerCase();

        if (msgLower.startsWith('!songrequest ') || msgLower.startsWith('!sr ')) {
            const query = message.replace(/^!(songrequest|sr)\s+/i, '').trim();
            if (query && this.requestQueue.length < this.maxRequests) {
                const request = { user, query, timestamp: Date.now(), platform: 'youtube' };
                this.requestQueue.push(request);
                this.onSongRequest(request);
            }
            return;
        }

        if (msgLower === '!np' || msgLower === '!nowplaying' || msgLower === '!song') {
            this.onCommand({ command: 'np', user, platform: 'youtube' });
            return;
        }

        this.onChatMessage({
            user,
            message,
            color: author.isChatOwner ? '#FFD600' : author.isChatModerator ? '#5E84F1' : '#CC0000',
            emotes: [],
            platform: 'youtube',
            timestamp: new Date(snippet.publishedAt).getTime() || Date.now(),
        });
    }
}
