export function attachDragHandlers(element, handlers) {
	const eventMap = {
		'dragstart': handlers.start,
		'drag': handlers.drag,
		'dragend': handlers.end,
		'click': handlers.click,
		'mousedown': handlers.mouseDown,
		'mouseup': handlers.mouseUp,
		'mousemove': handlers.mouseMove
	};

	Object.entries(eventMap).forEach(([event, handler]) => {
		if (handler) element.on(event, handler);
	});

	return () => {
		Object.entries(eventMap).forEach(([event, handler]) => {
			if (handler) element.off(event, handler);
		});
	};
}
