import { DurableObject } from "cloudflare:workers";

interface Env {
	VEET: DurableObjectNamespace<Veet>;
}

export class Veet extends DurableObject<Env> {
	private sessions: Map<WebSocket, any>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.sessions = new Map();
		this.ctx.getWebSockets().forEach((ws) => {
			this.sessions.set(ws, {...ws.deserializeAttachment()});
		});
	}

	async fetch(request: Request): Promise<Response> {
		// Check if it's a WebSocket request
		if (request.headers.get("Upgrade") === "websocket") {
			const pair = new WebSocketPair();
			this.ctx.acceptWebSocket(pair[1]);
			this.sessions.set(pair[1], {});
			return new Response(null, {status: 101, webSocket: pair[0]});
		}
		
		// Handle regular HTTP requests
		return new Response("Please connect via WebSocket", {status: 426});
	}
	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
		const session = this.sessions.get(ws);
		if (!session.id) {
			session.id = crypto.randomUUID();
			ws.serializeAttachment({...ws.deserializeAttachment(), id: session.id});
			ws.send(JSON.stringify({ready: true, id: session.id}));
		}
		this.broadcast(ws, message);
	}
	broadcast(sender: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
		const id = this.sessions.get(sender).id;
		for (let [ws, session] of this.sessions) {
			if (ws===sender) continue;
			switch (typeof message) {
				case "string":
					ws.send(JSON.stringify({...JSON.parse(message), id}));
					break;
				case "object":
					ws.send(JSON.stringify({...message, id}));
					break;
			}
		}
	}
	webSocketError(ws: WebSocket, error: unknown): void | Promise<void> {
		this.close(ws);
	}
	webSocketClose(ws: WebSocket): void | Promise<void> {
		this.close(ws)
	}
	close(ws: WebSocket): void | Promise<void> {
		const session = this.sessions.get(ws);
		if (!session.id) {
			return;
		}
		this.broadcast(ws, JSON.stringify({type: "left"}));
		this.sessions.delete(ws);
	}
}

export default {
	
	async fetch(request, env, ctx): Promise<Response> {
		const upgrade = request.headers.get("Upgrade");
		if (!upgrade || upgrade !== "websocket") {
			return new Response("Please connect via WebSocket", {status: 426});
		}
		
		const id: DurableObjectId = env.VEET.idFromName(new URL(request.url).pathname);
		const veet = env.VEET.get(id);
		return veet.fetch(request);
	},
} satisfies ExportedHandler<Env>;
