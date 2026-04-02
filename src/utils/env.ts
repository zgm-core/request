/**
 * 判断是否为开发环境
 */
export function isDevelopment(): boolean {
    if (typeof process !== 'undefined' && process.env) {
        return process.env.NODE_ENV === 'development';
    }
    return false;
}

/**
 * 判断是否为浏览器环境
 */
export function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}
