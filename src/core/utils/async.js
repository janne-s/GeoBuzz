export function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function waitForNextFrame() {
	return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
