# 项目集成说明（Python 后端）

将 Skill 文件放入你的 Python 后端项目，读取内容组装 System Prompt，注入你已有的 LLM 调用即可。

---

## 目录

1. [文件放置位置](#文件放置位置)
2. [Skill 注册表](#skill-注册表)
3. [Skill 加载工具类](#skill-加载工具类)
4. [多轮对话 Session 管理](#多轮对话-session-管理)
5. [API 接口设计](#api-接口设计)
6. [前端调用方式](#前端调用方式)
7. [扩展新分类](#扩展新分类)

---

## 文件放置位置

将 Skill 目录复制到后端项目中：

```
your-backend/
└── skills/
    └── ecommerce-image-gen/
        ├── SKILL.md
        ├── assets/
        │   └── reference-images/
        │       └── perfume/        ← 香水内置参考图放这里
        └── references/
            ├── categories.md
            └── integration.md
```

---

## Skill 注册表

后端维护一份注册表，决定用户上传图片后展示哪些 Skill 标签。新增 Skill 时只需追加一条记录。

新建 `skills/registry.py`：

```python
# skills/registry.py

SKILL_REGISTRY = [
    {
        "id": "ecommerce-image-gen",
        "label": "电商生图Skill",          # 前端展示的标签文字
        "trigger": "image_upload",          # 触发条件：用户上传图片时展示
    },
    # 后续新增 Skill 在此追加：
    # {
    #     "id": "background-remove",
    #     "label": "抠图Skill",
    #     "trigger": "image_upload",
    # },
]

def get_skills_for_trigger(trigger: str) -> list[dict]:
    """根据触发条件返回可用 Skill 列表"""
    return [s for s in SKILL_REGISTRY if s["trigger"] == trigger]
```

---

## Skill 加载工具类

新建 `skills/ecommerce_image_gen.py`：

```python
# skills/ecommerce_image_gen.py
from pathlib import Path
import base64
import re

SKILL_DIR = Path(__file__).parent / "ecommerce-image-gen"


def load_system_prompt() -> str:
    """加载 SKILL.md 作为基础 System Prompt"""
    return (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")


def load_category_prompt(category_id: str) -> str:
    """识别到商品分类后，动态加载对应分类配置"""
    content = (SKILL_DIR / "references" / "categories.md").read_text(encoding="utf-8")
    sections = re.split(r"\n(?=## )", content)
    for section in sections:
        if re.match(rf"## .*{re.escape(category_id)}", section, re.IGNORECASE):
            return section
    return content  # 未匹配则返回全部分类配置


def load_builtin_refs(category_id: str) -> list[str]:
    """加载内置参考图（用户未上传时使用），返回 base64 列表"""
    ref_dir = SKILL_DIR / "assets" / "reference-images" / category_id
    if not ref_dir.exists():
        return []
    images = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        for p in sorted(ref_dir.glob(ext)):
            images.append(base64.b64encode(p.read_bytes()).decode())
    return images[:3]  # 最多 3 张


def build_system_prompt(category_id: str | None = None) -> str:
    """组装完整 System Prompt"""
    prompt = load_system_prompt()
    if category_id:
        prompt += "\n\n---\n\n# 当前商品分类配置\n\n"
        prompt += load_category_prompt(category_id)
    return prompt


def extract_prompt_from_reply(reply: str) -> str | None:
    """从 LLM 回复中提取图像生成 Prompt"""
    match = re.search(r"生成 Prompt[：:]\s*(.+?)(?:\n|$)", reply)
    return match.group(1).strip() if match else None
```

---

## 多轮对话 Session 管理

```python
# services/ecommerce_session.py
from skills.ecommerce_image_gen import build_system_prompt, load_builtin_refs, extract_prompt_from_reply
import re


class EcommerceImageSession:
    def __init__(self):
        self.messages: list[dict] = []
        self.category_id: str | None = None
        self.system_prompt: str = build_system_prompt()

    def add_user_message(self, text: str, images_b64: list[str] = []):
        content = []
        for img in images_b64:
            content.append({"type": "image", "data": img})
        content.append({"type": "text", "text": text})
        self.messages.append({"role": "user", "content": content})

    def on_reply(self, reply: str):
        """LLM 回复后调用，自动识别分类并更新 System Prompt"""
        self.messages.append({"role": "assistant", "content": reply})

        if not self.category_id:
            detected = self._detect_category(reply)
            if detected:
                self.category_id = detected
                # 动态追加分类配置，后续轮次生效
                self.system_prompt = build_system_prompt(detected)

    def get_builtin_refs(self) -> list[str]:
        """获取当前分类的内置参考图"""
        if self.category_id:
            return load_builtin_refs(self.category_id)
        return []

    def get_final_prompt(self, reply: str) -> str | None:
        """从最终回复中提取图像生成 Prompt"""
        return extract_prompt_from_reply(reply)

    @staticmethod
    def _detect_category(reply: str) -> str | None:
        CATEGORY_KEYWORDS = {
            "perfume": ["香水", "perfume", "fragrance"],
            "skincare": ["护肤", "skincare", "面霜", "精华"],
            "apparel": ["服装", "衣", "apparel", "fashion"],
            "electronics": ["数码", "electronics", "手机", "耳机"],
            "food": ["食品", "food", "饮品", "beverage"],
            "home": ["家居", "home", "家具", "furniture"],
        }
        reply_lower = reply.lower()
        for cat_id, keywords in CATEGORY_KEYWORDS.items():
            if any(kw in reply_lower for kw in keywords):
                return cat_id
        return None
```

---

## API 接口设计

完整流程分为 **3 个接口**，以 FastAPI 为例：

```
POST /api/chat/upload      ← Step 0：上传图片，返回 Skill 标签列表
POST /api/skill/activate   ← Step 1：用户点击标签，触发 Skill 分析
POST /api/ecommerce/confirm ← Step 2-5：确认生成，返回 Prompt
```

新建 `routers/chat.py`（处理 Step 0）：

```python
# routers/chat.py
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from skills.registry import get_skills_for_trigger
import base64, uuid

router = APIRouter(prefix="/api/chat", tags=["chat"])

# 临时存储上传的图片（生产换 S3 / Redis）
uploaded_images: dict[str, str] = {}


@router.post("/upload")
async def upload_image(image: UploadFile = File(...)):
    """
    Step 0：用户上传图片
    - 不分析图片内容
    - 返回可用 Skill 标签列表，前端渲染为可点击标签
    """
    image_id = str(uuid.uuid4())
    uploaded_images[image_id] = base64.b64encode(await image.read()).decode()

    skills = get_skills_for_trigger("image_upload")

    return JSONResponse({
        "image_id": image_id,
        "skills": skills,   # [{id, label}, ...]  前端按此渲染标签
    })
```

新建 `routers/skill.py`（处理 Step 1：点击标签进入 Skill）：

```python
# routers/skill.py
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from services.ecommerce_session import EcommerceImageSession
from routers.chat import uploaded_images
import uuid

router = APIRouter(prefix="/api/skill", tags=["skill"])

sessions: dict[str, EcommerceImageSession] = {}


@router.post("/activate")
async def activate_skill(
    skill_id: str = Body(...),
    image_id: str = Body(...),
):
    """
    Step 1：用户点击 Skill 标签后调用
    - skill_id: 用户点击的 Skill（如 "ecommerce-image-gen"）
    - image_id: 上传接口返回的 image_id
    """
    image_b64 = uploaded_images.get(image_id)
    if not image_b64:
        return JSONResponse({"error": "image not found"}, status_code=404)

    if skill_id == "ecommerce-image-gen":
        session = EcommerceImageSession()
        session_id = str(uuid.uuid4())
        sessions[session_id] = session

        session.add_user_message(
            text="请分析这张商品图片，识别商品类型和分类，输出识别结果，然后询问我是否需要生成电商主图。",
            images_b64=[image_b64],
        )

        reply = await your_llm_call(
            system=session.system_prompt,
            messages=session.messages,
        )
        session.on_reply(reply)

        return JSONResponse({
            "session_id": session_id,
            "skill_id": skill_id,
            "reply": reply,
            "category": session.category_id,
        })

    return JSONResponse({"error": f"unknown skill: {skill_id}"}, status_code=400)
```

`routers/ecommerce.py`（处理 Step 2-5，复用现有 `/confirm` 接口，sessions 共享）：

```python
# routers/ecommerce.py
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from routers.skill import sessions          # 共享 sessions
import base64

router = APIRouter(prefix="/api/ecommerce", tags=["ecommerce-image"])


@router.post("/confirm")
async def confirm_generate(
    session_id: str = Form(...),
    confirmed: bool = Form(...),
    ref_images: list[UploadFile] = File(default=[]),
):
    """Step 2-5：用户确认生成主图"""
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "session not found"}, status_code=404)

    ref_b64 = [base64.b64encode(await f.read()).decode() for f in ref_images]
    if not ref_b64:
        ref_b64 = session.get_builtin_refs()

    user_text = "是的，请为我生成电商主图。" if confirmed else "不需要，谢谢。"
    session.add_user_message(text=user_text, images_b64=ref_b64)

    reply = await your_llm_call(
        system=session.system_prompt,
        messages=session.messages,
    )
    session.on_reply(reply)

    return JSONResponse({
        "session_id": session_id,
        "reply": reply,
        "image_prompt": session.get_final_prompt(reply),
        "category": session.category_id,
    })
```

注册所有路由（`main.py`）：

```python
from routers.chat import router as chat_router
from routers.skill import router as skill_router
from routers.ecommerce import router as ecommerce_router

app.include_router(chat_router)
app.include_router(skill_router)
app.include_router(ecommerce_router)
```

---

## 前端调用方式

```
Step 0  用户上传图片 → POST /api/chat/upload
        ↓ 返回 image_id + skills:[{id:"ecommerce-image-gen", label:"电商生图Skill"}]
        前端在对话框渲染可点击标签：[电商生图Skill]

Step 1  用户点击标签 → POST /api/skill/activate  {skill_id, image_id}
        ↓ 返回 session_id + 商品识别结果文本
        前端展示识别结果，等待用户确认

Step 2  用户确认生成 → POST /api/ecommerce/confirm  {session_id, confirmed:true}
        ↓ 返回 image_prompt
        前端拿 image_prompt → 调用图像生成接口
```

**JavaScript 示例：**

```javascript
// Step 0：上传图片
const form0 = new FormData()
form0.append('image', imageFile)
const { image_id, skills } = await fetch('/api/chat/upload', {
  method: 'POST', body: form0
}).then(r => r.json())

// 渲染 Skill 标签（skills 数组，方便后续多 Skill 扩展）
renderSkillTags(skills)  // 前端渲染 [电商生图Skill] 按钮

// Step 1：用户点击标签
async function onSkillTagClick(skillId) {
  const { session_id, reply } = await fetch('/api/skill/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_id: skillId, image_id })
  }).then(r => r.json())

  showMessage(reply)   // 展示商品识别结果

  // Step 2：用户点击"确认生成"
  const form2 = new FormData()
  form2.append('session_id', session_id)
  form2.append('confirmed', 'true')
  const { image_prompt } = await fetch('/api/ecommerce/confirm', {
    method: 'POST', body: form2
  }).then(r => r.json())

  generateImage(image_prompt)  // 调用图像生成接口
}
```

---

## 扩展新分类

只编辑 `skills/ecommerce-image-gen/references/categories.md`，添加新分类段落后，在 `EcommerceImageSession._detect_category` 里加上对应关键词即可，其余代码无需改动。
