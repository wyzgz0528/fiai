const { ValidationError } = require('../middlewares/errorHandler');

// 通用验证规则
const validators = {
  // 用户名验证
  username: (value) => {
    if (!value || typeof value !== 'string') {
      throw new ValidationError('用户名不能为空');
    }
    if (value.length < 2 || value.length > 20) {
      throw new ValidationError('用户名长度必须在2-20个字符之间');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      throw new ValidationError('用户名只能包含字母、数字和下划线');
    }
    return value.trim();
  },

  // 密码验证
  password: (value) => {
    if (!value || typeof value !== 'string') {
      throw new ValidationError('密码不能为空');
    }
    if (value.length < 6) {
      throw new ValidationError('密码长度不能少于6位');
    }
    return value;
  },

  // 真实姓名验证
  realName: (value) => {
    if (!value || typeof value !== 'string') {
      throw new ValidationError('真实姓名不能为空');
    }
    if (value.length < 2 || value.length > 20) {
      throw new ValidationError('真实姓名长度必须在2-20个字符之间');
    }
    return value.trim();
  },

  // 角色验证
  role: (value) => {
    const validRoles = ['employee', 'finance', 'manager', 'admin'];
    if (!validRoles.includes(value)) {
      throw new ValidationError('无效的角色类型');
    }
    return value;
  },

  // 金额验证
  amount: (value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      throw new ValidationError('金额必须是大于0的数字');
    }
    if (num > 999999.99) {
      throw new ValidationError('金额不能超过999,999.99');
    }
    return Math.round(num * 100) / 100; // 保留两位小数
  },

  // 用途验证
  purpose: (value) => {
    if (!value || typeof value !== 'string') {
      throw new ValidationError('用途不能为空');
    }
    if (value.length > 200) {
      throw new ValidationError('用途描述不能超过200个字符');
    }
    return value.trim();
  },

  // 备注验证
  remark: (value) => {
    if (value && typeof value !== 'string') {
      throw new ValidationError('备注必须是字符串');
    }
    if (value && value.length > 500) {
      throw new ValidationError('备注不能超过500个字符');
    }
    return value ? value.trim() : '';
  },

  // 状态验证
  status: (value, validStatuses) => {
    if (!validStatuses.includes(value)) {
      throw new ValidationError(`状态必须是以下之一: ${validStatuses.join(', ')}`);
    }
    return value;
  },

  // 页码验证
  page: (value) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 1) {
      throw new ValidationError('页码必须是大于0的整数');
    }
    return num;
  },

  // 页面大小验证
  pageSize: (value) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 1 || num > 100) {
      throw new ValidationError('页面大小必须在1-100之间');
    }
    return num;
  },

  // ID验证
  id: (value) => {
    const num = parseInt(value);
    if (isNaN(num) || num <= 0) {
      throw new ValidationError('ID必须是大于0的整数');
    }
    return num;
  },

  // 文件类型验证
  fileType: (mimetype, allowedTypes) => {
    if (!allowedTypes.includes(mimetype)) {
      throw new ValidationError(`不支持的文件类型: ${mimetype}`);
    }
    return mimetype;
  },

  // 文件大小验证
  fileSize: (size, maxSize) => {
    if (size > maxSize) {
      throw new ValidationError(`文件大小不能超过${maxSize / 1024 / 1024}MB`);
    }
    return size;
  }
};

// 验证对象
const validate = (data, schema) => {
  const result = {};
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    try {
      const value = data[field];
      
      // 检查必填字段
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 是必填字段`);
        continue;
      }

      // 如果字段不是必填且为空，跳过验证
      if (!rules.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // 应用验证器
      let validatedValue = value;
      if (rules.validator) {
        validatedValue = rules.validator(value, rules.options);
      }

      // 应用转换器
      if (rules.transform) {
        validatedValue = rules.transform(validatedValue);
      }

      result[field] = validatedValue;
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push(`${field} 验证失败`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '));
  }

  return result;
};

// 常用验证模式
const schemas = {
  // 用户注册验证
  userRegister: {
    username: { required: true, validator: validators.username },
    password: { required: true, validator: validators.password },
    password2: { required: true, validator: validators.password },
    real_name: { required: true, validator: validators.realName }
  },

  // 用户登录验证
  userLogin: {
    username: { required: true, validator: validators.username },
    password: { required: true, validator: validators.password }
  },

  // 借款申请验证
  loanCreate: {
    amount: { required: true, validator: validators.amount },
    purpose: { required: true, validator: validators.purpose }
  },

  // 报销申请验证
  reimbursementCreate: {
    amount: { required: true, validator: validators.amount },
    purpose: { required: true, validator: validators.purpose },
    remark: { required: false, validator: validators.remark }
  },

  // 分页查询验证
  pagination: {
    page: { required: false, validator: validators.page, transform: (v) => v || 1 },
    pageSize: { required: false, validator: validators.pageSize, transform: (v) => v || 10 }
  }
};

module.exports = {
  validators,
  validate,
  schemas
}; 