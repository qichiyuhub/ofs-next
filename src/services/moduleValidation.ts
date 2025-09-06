// Module parameter validation service

import type { ModuleParameter } from '@/types/module'

export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
}

export interface ParameterValidationRules {
  required: boolean
  pattern?: string
  minLength?: number
  maxLength?: number
  type?: 'string' | 'number' | 'email' | 'url' | 'ip' | 'mac' | 'hostname'
  customMessage?: string
}

export class ModuleValidationService {
  /**
   * Validate a single parameter value
   */
  validateParameter(param: ModuleParameter, value: string): ValidationResult {
    // Check required
    if (param.required && (!value || value.trim() === '')) {
      return {
        isValid: false,
        errorMessage: `${param.name} 是必填项`
      }
    }

    // Skip validation for empty optional parameters
    if (!param.required && (!value || value.trim() === '')) {
      return { isValid: true }
    }

    // Pattern validation
    if (param.validation?.pattern) {
      const patternResult = this.validatePattern(param.validation.pattern, value)
      if (!patternResult.isValid) {
        return {
          isValid: false,
          errorMessage: `${param.name} 格式不正确: ${patternResult.errorMessage}`
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Validate parameter against regex pattern
   */
  private validatePattern(pattern: string, value: string): ValidationResult {
    try {
      const regex = new RegExp(pattern)
      if (!regex.test(value)) {
        return {
          isValid: false,
          errorMessage: this.getPatternErrorMessage(pattern)
        }
      }
      return { isValid: true }
    } catch (error) {
      console.warn('Invalid regex pattern:', pattern, error)
      return { isValid: true } // Skip validation if pattern is invalid
    }
  }

  /**
   * Get user-friendly error message for common patterns
   */
  private getPatternErrorMessage(pattern: string): string {
    const commonPatterns: Record<string, string> = {
      // IP address patterns
      '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$': '请输入有效的IP地址',
      '^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$': '请输入有效的IP地址',
      
      // MAC address patterns
      '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$': '请输入有效的MAC地址',
      '^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$': '请输入有效的MAC地址',
      
      // Email patterns
      '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$': '请输入有效的邮箱地址',
      
      // URL patterns
      '^https?://.*': '请输入有效的URL地址',
      '^(https?|ftp)://[^\\s/$.?#].[^\\s]*$': '请输入有效的URL地址',
      
      // Hostname patterns
      '^[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?$': '请输入有效的主机名',
      
      // Port patterns
      '^(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3})$': '请输入有效的端口号 (1-65535)',
      
      // Number patterns
      '^[0-9]+$': '请输入数字',
      '^[1-9][0-9]*$': '请输入正整数',
      
      // Password patterns
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d@$!%*?&]{8,}$': '密码至少8位，包含大小写字母和数字',
      
      // SSID patterns
      '^[\\x20-\\x7E]{1,32}$': '请输入有效的SSID (1-32个字符)',
    }

    // Check for exact matches
    for (const [patternKey, message] of Object.entries(commonPatterns)) {
      if (pattern === patternKey) {
        return message
      }
    }

    // Check for partial matches
    if (pattern.includes('IP') || pattern.includes('ip')) {
      return '请输入有效的IP地址'
    }
    if (pattern.includes('MAC') || pattern.includes('mac')) {
      return '请输入有效的MAC地址'  
    }
    if (pattern.includes('@')) {
      return '请输入有效的邮箱地址'
    }
    if (pattern.includes('http')) {
      return '请输入有效的URL地址'
    }
    if (pattern.includes('[0-9]')) {
      return '请输入数字'
    }

    return '输入格式不正确'
  }

  /**
   * Validate all parameters for a module selection
   */
  validateAllParameters(
    parameters: { [key: string]: ModuleParameter },
    values: { [key: string]: string }
  ): { isValid: boolean; errors: { [key: string]: string } } {
    const errors: { [key: string]: string } = {}

    for (const [key, param] of Object.entries(parameters)) {
      const value = values[key] || ''
      const result = this.validateParameter(param, value)
      
      if (!result.isValid) {
        errors[key] = result.errorMessage!
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    }
  }

  /**
   * Get Vuetify validation rules for a parameter
   */
  getVuetifyRules(param: ModuleParameter): Array<(value: string) => boolean | string> {
    const rules: Array<(value: string) => boolean | string> = []

    // Required rule
    if (param.required) {
      rules.push((value: string) => {
        if (!value || value.trim() === '') {
          return `${param.name} 是必填项`
        }
        return true
      })
    }

    // Pattern rule
    if (param.validation?.pattern) {
      rules.push((value: string) => {
        // Skip validation for empty optional parameters
        if (!param.required && (!value || value.trim() === '')) {
          return true
        }
        
        const result = this.validateParameter(param, value)
        return result.isValid || result.errorMessage!
      })
    }

    return rules
  }

  /**
   * Validate user download URL
   */
  validateDownloadUrl(url: string): ValidationResult {
    if (!url || url.trim() === '') {
      return {
        isValid: false,
        errorMessage: '下载URL是必需的'
      }
    }

    const urlPattern = /^https?:\/\/.+/
    if (!urlPattern.test(url)) {
      return {
        isValid: false,
        errorMessage: '必须是有效的HTTP/HTTPS URL'
      }
    }

    return { isValid: true }
  }

  /**
   * Get download URL validation rules for Vuetify
   */
  getDownloadUrlRules(): Array<(value: string) => boolean | string> {
    return [
      (value: string) => {
        const result = this.validateDownloadUrl(value)
        return result.isValid || result.errorMessage!
      }
    ]
  }
}

// Export singleton instance
export const moduleValidationService = new ModuleValidationService()