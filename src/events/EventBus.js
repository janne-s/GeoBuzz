export const EventBus = {
	register(handlers, mapInstance) {
		Object.entries(handlers).forEach(([key, handler]) => {
			if (key === 'map') {
				if (mapInstance) {
					Object.entries(handler).forEach(([event, fn]) => mapInstance.on(event, fn));
				}
			} else if (key === 'window') {
				Object.entries(handler).forEach(([event, fn]) => window.addEventListener(event, fn));
			} else if (key === 'document') {
				Object.entries(handler).forEach(([event, fn]) => document.addEventListener(event, fn));
			} else if (key.includes(':')) {
				const [selector, event] = key.split(':');
				if (selector === 'body') {
					const eventTypes = event.split(',');
					eventTypes.forEach(evt => document.body.addEventListener(evt.trim(), handler.handler, handler.options));
				} else {
					const element = document.querySelector(selector);
					if (!element) {
						console.warn(`Event handler registration failed: element not found for selector "${selector}"`);
						return;
					}
					element.addEventListener(event, handler);
				}
			} else {
				const element = document.querySelector(key);
				if (!element) {
					console.warn(`Event handler registration failed: element not found for selector "${key}"`);
					return;
				}
				element.addEventListener('click', handler);
			}
		});
	}
};
