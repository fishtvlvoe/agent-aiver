export const FAQ_BULK_MAX_ITEMS = 100;
export const FAQ_QUESTION_MAX_LENGTH = 200;
export const FAQ_ANSWER_MAX_LENGTH = 2000;

export type ParsedFaq = { question: string; answer: string };
export type FaqParseError = { line: number; message: string };
export type FaqParseResult = { faqs: ParsedFaq[]; errors: FaqParseError[] };

type NumberedLine = { line: number; text: string };

const QUESTION_PREFIX = /^問[:：]/;
const ANSWER_PREFIX = /^答[:：]/;

// 以空行切成每則問答；行號從 1 起算，供預覽標出錯誤行
function splitBlocks(text: string): NumberedLine[][] {
	const blocks: NumberedLine[][] = [];
	let current: NumberedLine[] = [];

	text.split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === "") {
			if (current.length > 0) blocks.push(current);
			current = [];
			return;
		}
		current.push({ line: index + 1, text: line });
	});

	if (current.length > 0) blocks.push(current);
	return blocks;
}

export function parseFaqBulkText(text: string): FaqParseResult {
	const faqs: ParsedFaq[] = [];
	const errors: FaqParseError[] = [];
	const blocks = splitBlocks(text);

	if (blocks.length > FAQ_BULK_MAX_ITEMS) {
		errors.push({
			line: blocks[FAQ_BULK_MAX_ITEMS][0].line,
			message: `一次最多 ${FAQ_BULK_MAX_ITEMS} 則`,
		});
	}

	blocks.forEach((block, index) => {
		const no = index + 1;
		const [questionLine, answerLine, extraLine] = block;

		if (!QUESTION_PREFIX.test(questionLine.text)) {
			errors.push({ line: questionLine.line, message: `第 ${no} 則必須以「問:」開頭` });
			return;
		}
		if (!answerLine || !ANSWER_PREFIX.test(answerLine.text)) {
			errors.push({ line: questionLine.line, message: `第 ${no} 則缺少回答` });
			return;
		}
		if (extraLine) {
			errors.push({ line: extraLine.line, message: `第 ${no} 則只能有「問:」與「答:」兩行` });
			return;
		}

		const question = questionLine.text.replace(QUESTION_PREFIX, "").trim();
		const answer = answerLine.text.replace(ANSWER_PREFIX, "").trim();

		if (question === "") {
			errors.push({ line: questionLine.line, message: `第 ${no} 則問題不可空白` });
			return;
		}
		if (question.length > FAQ_QUESTION_MAX_LENGTH) {
			errors.push({
				line: questionLine.line,
				message: `第 ${no} 則問題不可超過 ${FAQ_QUESTION_MAX_LENGTH} 字`,
			});
			return;
		}
		if (answer === "") {
			errors.push({ line: answerLine.line, message: `第 ${no} 則回答不可空白` });
			return;
		}
		if (answer.length > FAQ_ANSWER_MAX_LENGTH) {
			errors.push({
				line: answerLine.line,
				message: `第 ${no} 則回答不可超過 ${FAQ_ANSWER_MAX_LENGTH} 字`,
			});
			return;
		}

		faqs.push({ question, answer });
	});

	return { faqs, errors };
}
