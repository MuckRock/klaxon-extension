import { selectorForElement } from './selector';

/** Minimum fraction of an element's own area that must be covered by the selection. */
export const MIN_COVERAGE = 0.25;

/** Minimum fraction of the selection area an element must occupy to be "dominant". */
export const MIN_DOMINANCE = 0.1;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Area of the overlap between two rectangles, or 0 if they don't overlap. */
export function intersectionArea(a: Rect, b: Rect): number {
	const overlapX = Math.max(
		0,
		Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
	);
	const overlapY = Math.max(
		0,
		Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
	);
	return overlapX * overlapY;
}

/** Normalize drag start/end into a proper Rect (handles any drag direction). */
export function resolveSelectionRect(
	startX: number,
	startY: number,
	endX: number,
	endY: number
): Rect {
	return {
		x: Math.min(startX, endX),
		y: Math.min(startY, endY),
		width: Math.abs(endX - startX),
		height: Math.abs(endY - startY)
	};
}

/**
 * Sort elements descending by overlap area, filtering out zero-overlap
 * and elements where the selection covers less than 25% of the element's
 * own area (avoids selecting large backgrounds behind the target).
 */
export function rankByOverlap(
	elements: { el: Element; rect: Rect }[],
	selection: Rect
): { el: Element; area: number; coverage: number }[] {
	return elements
		.map(({ el, rect }) => {
			const area = intersectionArea(rect, selection);
			const elArea = rect.width * rect.height;
			const coverage = elArea > 0 ? area / elArea : 0;
			return { el, area, coverage };
		})
		.filter(({ area, coverage }) => area > 0 && coverage >= MIN_COVERAGE)
		.sort((a, b) => b.area - a.area);
}

/**
 * Comma-joined CSS selectors for elements whose overlap is ≥10% of the
 * selection area.
 */
export function dominantSelectors(
	ranked: { el: Element; area: number }[],
	selectionArea: number
): string {
	if (selectionArea === 0) return '';
	const threshold = selectionArea * MIN_DOMINANCE;
	return ranked
		.filter(({ area }) => area >= threshold)
		.map(({ el }) => selectorForElement(el))
		.join(', ');
}

/**
 * Find the CSS selector components shared by all elements — common tag
 * (if unanimous) and common classes. IDs are ignored since they're unique.
 */
export function commonSelector(elements: Element[]): string {
	if (elements.length === 0) return '';
	if (elements.length === 1) return selectorForElement(elements[0]);

	const tags = elements.map((el) => el.nodeName.toLowerCase());
	const sharedTag = tags.every((t) => t === tags[0]) ? tags[0] : '';

	const classSets = elements.map((el) =>
		el.className ? new Set(el.className.trim().split(/\s+/)) : new Set<string>()
	);
	const sharedClasses = [...classSets[0]].filter((cls) =>
		classSets.every((s) => s.has(cls))
	);

	const clsPart = sharedClasses.length > 0 ? '.' + sharedClasses.join('.') : '';
	return sharedTag + clsPart;
}

/** All elements under root excluding the host subtree, each with its bounding rect. */
export function collectVisibleElements(
	root: Element,
	host: Element
): { el: Element; rect: Rect }[] {
	const all = root.querySelectorAll('*');
	const result: { el: Element; rect: Rect }[] = [];
	for (const el of all) {
		if (el === host || host.contains(el)) continue;
		const r = el.getBoundingClientRect();
		result.push({ el, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
	}
	return result;
}
