export function toFileSlug(title, fallback = 'buzz') {
	const slug = (title || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ø/gi, 'o')
		.replace(/æ/gi, 'ae')
		.replace(/ß/g, 'ss')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug || fallback;
}
