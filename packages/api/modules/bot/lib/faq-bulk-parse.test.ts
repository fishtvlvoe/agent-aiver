import { describe, expect, it } from "vitest";

import { FAQ_ANSWER_MAX_LENGTH, FAQ_QUESTION_MAX_LENGTH, parseFaqBulkText } from "./faq-bulk-parse";

describe("parseFaqBulkText", () => {
	it("parses two valid FAQs separated by a blank line", () => {
		const text = "問:幾點營業?\n答:10:00–19:00\n\n問:有免運嗎?\n答:滿 1000 免運";

		expect(parseFaqBulkText(text)).toEqual({
			faqs: [
				{ question: "幾點營業?", answer: "10:00–19:00" },
				{ question: "有免運嗎?", answer: "滿 1000 免運" },
			],
			errors: [],
		});
	});

	it("reports a FAQ that is missing its answer line", () => {
		expect(parseFaqBulkText("問:幾點營業?")).toEqual({
			faqs: [],
			errors: [{ line: 1, message: "第 1 則缺少回答" }],
		});
	});

	it("reports more than 100 FAQs as one error", () => {
		const text = Array.from(
			{ length: 101 },
			(_, index) => `問:問題 ${index + 1}\n答:回答 ${index + 1}`,
		).join("\n\n");

		const { errors } = parseFaqBulkText(text);

		// 每則佔 2 行加 1 行空白，第 101 則從第 301 行開始
		expect(errors).toEqual([{ line: 301, message: "一次最多 100 則" }]);
	});

	it("accepts exactly 100 FAQs without an error", () => {
		const text = Array.from(
			{ length: 100 },
			(_, index) => `問:問題 ${index + 1}\n答:回答 ${index + 1}`,
		).join("\n\n");

		const { faqs, errors } = parseFaqBulkText(text);

		expect(faqs).toHaveLength(100);
		expect(errors).toEqual([]);
	});

	it("accepts full-width colons and trims surrounding spaces", () => {
		expect(parseFaqBulkText("  問：可以刷卡嗎？  \n答：可以。")).toEqual({
			faqs: [{ question: "可以刷卡嗎？", answer: "可以。" }],
			errors: [],
		});
	});

	it("reports a block that does not start with 問:", () => {
		expect(parseFaqBulkText("可以刷卡嗎？\n答:可以。")).toEqual({
			faqs: [],
			errors: [{ line: 1, message: "第 1 則必須以「問:」開頭" }],
		});
	});

	it("reports an empty question and keeps the valid FAQs", () => {
		const text = "問:\n答:可以。\n\n問:有免運嗎?\n答:滿 1000 免運";

		expect(parseFaqBulkText(text)).toEqual({
			faqs: [{ question: "有免運嗎?", answer: "滿 1000 免運" }],
			errors: [{ line: 1, message: "第 1 則問題不可空白" }],
		});
	});

	it("reports questions and answers over the length limits", () => {
		const longQuestion = `問:${"問".repeat(FAQ_QUESTION_MAX_LENGTH + 1)}\n答:可以。`;
		const longAnswer = `問:可以刷卡嗎?\n答:${"答".repeat(FAQ_ANSWER_MAX_LENGTH + 1)}`;

		expect(parseFaqBulkText(longQuestion).errors).toEqual([
			{ line: 1, message: `第 1 則問題不可超過 ${FAQ_QUESTION_MAX_LENGTH} 字` },
		]);
		expect(parseFaqBulkText(longAnswer).errors).toEqual([
			{ line: 2, message: `第 1 則回答不可超過 ${FAQ_ANSWER_MAX_LENGTH} 字` },
		]);
	});

	it("returns nothing for empty input", () => {
		expect(parseFaqBulkText("  \n\n ")).toEqual({ faqs: [], errors: [] });
	});
});
