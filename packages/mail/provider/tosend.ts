import { config } from "../config";
import type { SendEmailHandler } from "../types";

export const send: SendEmailHandler = async ({ to, from, subject, cc, bcc, replyTo, html, text }) => {
	const res = await fetch("https://api.tosend.com/v2/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.TOSEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: { email: from ?? config.mailFrom, name: "AIVER" },
			to: [{ email: to }],
			cc: cc?.map((email) => ({ email })),
			bcc: bcc?.map((email) => ({ email })),
			reply_to: replyTo ? { email: replyTo } : undefined,
			subject,
			html,
			text,
		}),
	});
	if (!res.ok) {
		throw new Error(`ToSend 寄信失敗：${res.status}`);
	}
};
