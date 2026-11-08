const LINE_SUB_PATTERN = /^U([0-9a-f]{32})$/i;

export function canonicalLineSub(sub: string) {
	const match = LINE_SUB_PATTERN.exec(sub);
	return match ? `U${match[1].toLowerCase()}` : sub;
}
