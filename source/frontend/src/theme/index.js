// 企业级现代化主题配置
export const theme = {
  token: {
    // 主色调 - 专业蓝色
    colorPrimary: '#1890ff',
    colorPrimaryHover: '#40a9ff',
    colorPrimaryActive: '#096dd9',
    
    // 成功色
    colorSuccess: '#52c41a',
    colorSuccessHover: '#73d13d',
    
    // 警告色
    colorWarning: '#faad14',
    colorWarningHover: '#ffc53d',
    
    // 错误色
    colorError: '#ff4d4f',
    colorErrorHover: '#ff7875',
    
    // 信息色
    colorInfo: '#1890ff',
    colorInfoHover: '#40a9ff',
    
    // 文字颜色
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorTextQuaternary: '#bfbfbf',
    
    // 背景色
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorBgSpotlight: '#ffffff',
    
    // 边框色
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',
    
    // 圆角
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    
    // 阴影
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    boxShadowSecondary: '0 1px 4px rgba(0, 0, 0, 0.06)',
    
    // 字体
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    
    // 间距
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    
    // 高度
    controlHeight: 32,
    controlHeightLG: 40,
    controlHeightSM: 24,
  },
  
  // 组件特定配置
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f5f5f5',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#e6f7ff',
      itemHoverBg: '#f5f5f5',
      itemActiveBg: '#e6f7ff',
      itemSelectedColor: '#1890ff',
      itemColor: '#262626',
      itemHoverColor: '#1890ff',
      itemActiveColor: '#1890ff',
      subMenuItemBg: 'transparent',
      darkItemBg: 'transparent',
      darkItemSelectedBg: '#177ddc',
      darkItemHoverBg: '#177ddc',
    },
    Card: {
      headerBg: '#ffffff',
      headerColor: '#262626',
      headerFontSize: 16,
      headerFontSizeSM: 14,
      headerHeight: 48,
      headerHeightSM: 40,
      headerPadding: '16px 24px',
      headerPaddingSM: '12px 16px',
      bodyPadding: 24,
      bodyPaddingSM: 16,
      actionsBg: '#ffffff',
      actionsLiMargin: '12px 0',
      tabsMarginBottom: -17,
      extraColor: '#262626',
      extraFontSize: 14,
      headerFontWeight: 600,
      borderRadiusLG: 8,
    },
    Button: {
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 0 rgba(5, 145, 255, 0.1)',
      dangerColor: '#ffffff',
      dangerShadow: '0 2px 0 rgba(255, 77, 79, 0.1)',
      defaultColor: '#262626',
      defaultBg: '#ffffff',
      defaultBorderColor: '#d9d9d9',
      defaultShadow: '0 2px 0 rgba(0, 0, 0, 0.02)',
      borderRadius: 6,
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      paddingInline: 16,
      paddingInlineLG: 24,
      paddingInlineSM: 8,
      fontSize: 14,
      fontSizeLG: 16,
      fontSizeSM: 12,
      lineHeight: 1.5714285714285714,
      lineHeightLG: 1.5,
      lineHeightSM: 1.6666666666666667,
      fontWeight: 400,
      fontWeightStrong: 600,
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#262626',
      headerSplitColor: '#f0f0f0',
      rowHoverBg: '#fafafa',
      rowSelectedBg: '#e6f7ff',
      rowSelectedHoverBg: '#bae7ff',
      rowExpandedBg: '#fafafa',
      colorText: '#262626',
      colorTextHeading: '#262626',
      colorTextSecondary: '#595959',
      colorFillAlter: '#fafafa',
      colorFillSecondary: '#f5f5f5',
      colorFillTertiary: '#f5f5f5',
      colorFillQuaternary: '#f0f0f0',
      borderColor: '#f0f0f0',
      borderRadius: 6,
      headerBorderRadius: '6px 6px 0 0',
      footerBg: '#fafafa',
      footerColor: '#262626',
      headerSplitColor: '#f0f0f0',
      fixedHeaderSortActiveBg: '#e6f7ff',
      headerFilterHoverBg: '#f5f5f5',
      filterDropdownMenuBg: '#ffffff',
      filterDropdownBg: '#ffffff',
      filterDropdownMinWidth: 120,
      filterDropdownMaxHeight: 264,
      filterDropdownWidth: 120,
      filterDropdownMenuBg: '#ffffff',
      filterDropdownMenuBgHover: '#f5f5f5',
      filterDropdownMenuBgActive: '#e6f7ff',
      filterDropdownMenuBgSelected: '#e6f7ff',
      filterDropdownMenuBgSelectedHover: '#bae7ff',
      filterDropdownMenuBgSelectedActive: '#91d5ff',
      filterDropdownMenuBgSelectedDisabled: '#f5f5f5',
      filterDropdownMenuBgDisabled: '#f5f5f5',
      filterDropdownMenuBgHover: '#f5f5f5',
      filterDropdownMenuBgActive: '#e6f7ff',
      filterDropdownMenuBgSelected: '#e6f7ff',
      filterDropdownMenuBgSelectedHover: '#bae7ff',
      filterDropdownMenuBgSelectedActive: '#91d5ff',
      filterDropdownMenuBgSelectedDisabled: '#f5f5f5',
      filterDropdownMenuBgDisabled: '#f5f5f5',
    },
    Form: {
      labelColor: '#262626',
      labelFontSize: 14,
      labelHeight: 32,
      labelColonMarginInlineEnd: 8,
      requiredMark: false, // 禁用自动必填标记
      labelRequiredMarkColor: '#ff4d4f',
      labelOptionalMarkColor: '#8c8c8c',
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      controlPaddingHorizontal: 12,
      controlPaddingHorizontalSM: 8,
      controlPaddingHorizontalLG: 16,
      controlOutline: 'rgba(5, 145, 255, 0.2)',
      controlOutlineWidth: 2,
      controlItemBgHover: '#f5f5f5',
      controlItemBgActive: '#e6f7ff',
      controlItemBgActiveHover: '#bae7ff',
      controlItemBgSelected: '#e6f7ff',
      controlItemBgSelectedHover: '#bae7ff',
      controlItemBgSelectedActive: '#91d5ff',
      controlItemBgSelectedDisabled: '#f5f5f5',
      controlItemBgDisabled: '#f5f5f5',
      controlItemBgHover: '#f5f5f5',
      controlItemBgActive: '#e6f7ff',
      controlItemBgActiveHover: '#bae7ff',
      controlItemBgSelected: '#e6f7ff',
      controlItemBgSelectedHover: '#bae7ff',
      controlItemBgSelectedActive: '#91d5ff',
      controlItemBgSelectedDisabled: '#f5f5f5',
      controlItemBgDisabled: '#f5f5f5',
    },
    Input: {
      colorBgContainer: '#ffffff',
      colorBorder: '#d9d9d9',
      colorBorderSecondary: '#f0f0f0',
      colorText: '#262626',
      colorTextPlaceholder: '#bfbfbf',
      colorTextDisabled: '#bfbfbf',
      colorBgContainerDisabled: '#f5f5f5',
      colorBorderDisabled: '#d9d9d9',
      borderRadius: 6,
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      paddingInline: 12,
      paddingInlineLG: 16,
      paddingInlineSM: 8,
      fontSize: 14,
      fontSizeLG: 16,
      fontSizeSM: 12,
      lineHeight: 1.5714285714285714,
      lineHeightLG: 1.5,
      lineHeightSM: 1.6666666666666667,
      fontWeight: 400,
      fontWeightStrong: 600,
    },
    Select: {
      colorBgContainer: '#ffffff',
      colorBorder: '#d9d9d9',
      colorBorderSecondary: '#f0f0f0',
      colorText: '#262626',
      colorTextPlaceholder: '#bfbfbf',
      colorTextDisabled: '#bfbfbf',
      colorBgContainerDisabled: '#f5f5f5',
      colorBorderDisabled: '#d9d9d9',
      borderRadius: 6,
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      paddingInline: 12,
      paddingInlineLG: 16,
      paddingInlineSM: 8,
      fontSize: 14,
      fontSizeLG: 16,
      fontSizeSM: 12,
      lineHeight: 1.5714285714285714,
      lineHeightLG: 1.5,
      lineHeightSM: 1.6666666666666667,
      fontWeight: 400,
      fontWeightStrong: 600,
    },
    Modal: {
      colorBgElevated: '#ffffff',
      colorBgMask: 'rgba(0, 0, 0, 0.45)',
      colorIcon: '#8c8c8c',
      colorIconHover: '#262626',
      borderRadiusLG: 8,
      borderRadiusSM: 6,
      borderRadiusXS: 4,
      boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
      boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
      headerBg: '#ffffff',
      headerPadding: '16px 24px',
      headerPaddingSM: '12px 16px',
      bodyPadding: 24,
      bodyPaddingSM: 16,
      footerPadding: '16px 24px',
      footerPaddingSM: '12px 16px',
      titleFontSize: 16,
      titleFontSizeSM: 14,
      titleFontWeight: 600,
      titleLineHeight: 1.5,
      titleColor: '#262626',
      contentBg: '#ffffff',
      contentPadding: 24,
      contentPaddingSM: 16,
      headerHeight: 56,
      headerHeightSM: 48,
      bodyHeight: 400,
      bodyHeightSM: 300,
      footerHeight: 56,
      footerHeightSM: 48,
    },
  },
};

// 自定义样式变量
export const customStyles = {
  // 布局相关
  layout: {
    headerHeight: 64,
    siderWidth: 240,
    siderCollapsedWidth: 80,
    contentPadding: 24,
  },
  
  // 卡片样式
  card: {
    borderRadius: 8,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
    hoverShadow: '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
  },
  
  // 按钮样式
  button: {
    primary: {
      background: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)',
      border: 'none',
      boxShadow: '0 2px 0 rgba(5, 145, 255, 0.1)',
    },
    success: {
      background: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
      border: 'none',
      boxShadow: '0 2px 0 rgba(82, 196, 26, 0.1)',
    },
    warning: {
      background: 'linear-gradient(135deg, #faad14 0%, #ffc53d 100%)',
      border: 'none',
      boxShadow: '0 2px 0 rgba(250, 173, 20, 0.1)',
    },
    danger: {
      background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%)',
      border: 'none',
      boxShadow: '0 2px 0 rgba(255, 77, 79, 0.1)',
    },
  },
  
  // 表格样式
  table: {
    headerBg: '#fafafa',
    rowHoverBg: '#f5f5f5',
    borderColor: '#f0f0f0',
  },
  
  // 表单样式
  form: {
    labelColor: '#262626',
    borderColor: '#d9d9d9',
    focusBorderColor: '#1890ff',
  },
  
  // 状态颜色
  status: {
    success: '#52c41a',
    warning: '#faad14',
    error: '#ff4d4f',
    info: '#1890ff',
    processing: '#1890ff',
    default: '#d9d9d9',
  },
  
  // 文字颜色
  text: {
    primary: '#262626',
    secondary: '#595959',
    tertiary: '#8c8c8c',
    disabled: '#bfbfbf',
  },
  
  // 背景颜色
  background: {
    primary: '#ffffff',
    secondary: '#fafafa',
    tertiary: '#f5f5f5',
    layout: '#f0f0f0',
  },
  
  // 边框颜色
  border: {
    primary: '#d9d9d9',
    secondary: '#f0f0f0',
    tertiary: '#e8e8e8',
  },
}; 