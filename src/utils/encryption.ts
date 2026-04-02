import CryptoJS from 'crypto-js';
import { safeError } from './logger';

class Encryption {
    /**
     * 生成随机 IV（初始化向量）
     */
    private generateRandomIV(): string {
        // 生成 16 字节的随机 IV
        const iv = CryptoJS.lib.WordArray.random(16);
        return CryptoJS.enc.Hex.stringify(iv);
    }

    /**
     * AES 加密数据
     */
    public encrypt(data: string, key: string): string {
        // 生成 16 位密钥 k
        const k = CryptoJS.SHA256(key).toString().substring(0, 16);

        // 生成随机 IV，每次加密都不同
        const randomIV = this.generateRandomIV();
        const iv = CryptoJS.enc.Hex.parse(randomIV);

        const dataWordArray = CryptoJS.enc.Utf8.parse(data);

        // AES-CBC 加密
        const encrypted = CryptoJS.AES.encrypt(dataWordArray, CryptoJS.enc.Utf8.parse(k), {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        // 将 IV 和加密数据一起返回（格式：IV:encrypted）
        return `${randomIV}:${encrypted.toString()}`;
    }

    /**
     * 解密函数：用 token 处理后的密钥解密数据
     */
    public decryptWithToken(encryptedData: string, token: string) {
        const k = CryptoJS.SHA256(token).toString().substring(0, 16);

        try {
            // 从加密数据中提取 IV 和密文
            const [ivHex, ciphertext] = encryptedData.split(':');

            if (!ivHex || !ciphertext) {
                throw new Error('Invalid encrypted data format');
            }

            // 使用提取的 IV 进行解密
            const iv = CryptoJS.enc.Hex.parse(ivHex);
            const decryptedWordArray = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(k), {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }).toString(CryptoJS.enc.Utf8);

            try {
                return JSON.parse(decryptedWordArray);
            } catch {
                return decryptedWordArray; // 如果解析失败，返回原始字符串
            }
        } catch (error) {
            safeError('❌ 解密失败:', error);
            throw new Error('Failed to decrypt data');
        }
    }
}

export const encryption = new Encryption();
