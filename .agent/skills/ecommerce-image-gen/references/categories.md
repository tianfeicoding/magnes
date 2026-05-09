# 商品分类配置

每个分类包含：场景风格、背景、光线、Prompt 模板和建议规格。

---

## 香水 (Perfume / Fragrance)

**分类 ID:** `perfume`

**风格定位:** 高端奢华、精致感、仪式感

**场景风格:**
- 极简白色/米白色背景为主
- 可搭配花瓣、香料原料、丝绸、大理石等道具
- 户外花园场景（薰衣草田、玫瑰园等）

**背景偏好:**
- 主图：纯白/浅灰渐变背景（符合天猫/京东白底图标准）
- 氛围图：柔和焦外（Bokeh）、高端质感材质

**光线要求:**
- 侧逆光突出瓶身透明质感
- 柔和漫反射，避免强烈高光
- 暖白光（5500K-6000K）

**Prompt 模板 (英文):**
```
[perfume bottle name/description], identical product details from Image 1, follow the composition and background style of Image 2, inherit lighting and mood from Image 2, commercial product photography, 4K quality, professional studio lighting
```

**氛围图 Prompt 模板:**
```
[perfume bottle], surrounded by [rose petals/lavender/citrus slices], golden hour soft bokeh background, luxury lifestyle, editorial perfume advertisement, cinematic lighting, shallow depth of field
```

**建议规格:**
| 平台 | 主图尺寸 | 背景要求 |
|------|----------|----------|
| 天猫/淘宝 | 800×800px 或 1:1 | 白色底图 |
| 京东 | 800×800px | 白色底图 |
| 小红书 | 3:4 竖图 | 无严格要求 |
| 抖音/TikTok Shop | 1:1 | 白色或透明 |

---

## 护肤品 (Skincare)

**分类 ID:** `skincare`

**风格定位:** 干净、清透、科技感或自然感（根据品牌调性）

**场景风格:**
- 白色/浅粉/薄荷绿简洁背景
- 可搭配植物叶片、水滴、玻璃器皿等道具
- 极简主义构图

**背景偏好:**
- 主图：纯白背景
- 氛围图：淡雅色系渐变、自然材质（木纹/石板）

**光线要求:**
- 均匀柔光，突出产品质地
- 轻微正面补光消除阴影

**Prompt 模板 (英文):**
```
[skincare product description], identical product details from Image 1, follow the composition and background style of Image 2, inherit lighting and mood from Image 2, luxury skincare brand style, high resolution, commercial product photo
```

**建议规格:** 同香水分类

---

## 服装 (Apparel / Fashion)

**分类 ID:** `apparel`

**风格定位:** 时尚、质感、场景化

**场景风格:**
- 白底平铺（主图）
- 模特穿搭（场景图）
- 生活方式场景（户外、咖啡馆等）

**背景偏好:**
- 主图：纯白背景
- 场景图：自然场景或城市街景

**光线要求:**
- 自然光或模拟自然光棚拍
- 高色彩还原度

**Prompt 模板 (英文):**
```
[clothing item description], flat lay on white background, [fabric texture] visible, professional fashion product photography, top-down view, clean bright lighting, e-commerce ready
```

**建议规格:** 同香水分类，场景图可用 3:4 竖版

---

## 数码电子 (Electronics)

**分类 ID:** `electronics`

**风格定位:** 科技感、精准、专业

**场景风格:**
- 深色/黑色高质感背景
- 白色极简背景
- 科技蓝/渐变霓虹氛围

**背景偏好:**
- 主图：白底
- 氛围图：深色渐变、反光桌面

**光线要求:**
- 精准硬光突出轮廓和细节
- 边缘光勾勒产品形态

**Prompt 模板 (英文):**
```
[electronics product description], identical product details from Image 1, follow the composition and background style of Image 2, inherit lighting and mood from Image 2, technology aesthetic, ultra sharp details, 8K commercial photo
```

**建议规格:** 同香水分类

---

## 食品/饮品 (Food & Beverage)

**分类 ID:** `food`

**风格定位:** 食欲感、新鲜、场景化

**场景风格:**
- 餐桌/厨房自然场景
- 食材搭配（原料道具）
- 俯拍平铺构图

**背景偏好:**
- 木质桌面、大理石台面、白色背景
- 暖色调烘托食欲

**光线要求:**
- 暖光侧逆光突出食材质感
- 自然光模拟

**Prompt 模板 (英文):**
```
[food/beverage product description], identical product details from Image 1, follow the composition and background style of Image 2, inherit lighting and mood from Image 2, commercial food photo, 4K, realistic textures
```

**建议规格:** 同香水分类

---

## 家居/家具 (Home & Furniture)

**分类 ID:** `home`

**风格定位:** 生活感、温馨、品质

**场景风格:**
- 真实居家场景或仿真场景
- 白色简洁背景（主图）
- 生活方式场景（客厅/卧室/餐厅）

**背景偏好:**
- 主图：白底或浅灰
- 场景图：温馨室内环境

**光线要求:**
- 模拟自然窗光
- 均匀柔和

**Prompt 模板 (英文):**
```
[furniture/home decor description], identical product details from Image 1, follow the composition and background style of Image 2, inherit lighting and mood from Image 2, high-end home decor catalog style, realistic textures, 4K
```

**建议规格:** 主图 1:1，场景图可用 4:3 或 16:9

---

## 添加新分类

在此文件末尾按上方格式添加新分类，并在 SKILL.md 的分类列表中注册分类 ID。
