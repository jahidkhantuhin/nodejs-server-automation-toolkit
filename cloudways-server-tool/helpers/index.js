/**
 * Resolves after the given number of seconds (fractions allowed, e.g. 0.5).
 */
export function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}
