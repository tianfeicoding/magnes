import os
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import UserConfig

async def get_llm_config(db: Optional[AsyncSession] = None, is_layering=False):
    """
    根据业务场景获取 LLM 配置
    :param db: 数据库 Session，用于获取用户自定义的 URL 和 Key
    :param is_layering: 是否为"分层图片"业务
    :return: (base_url, api_key)
    """
    print(f"[LLM Config] 🚀 开始获取配置 (is_layering={is_layering})...")

    # 1. 配置键名设定（移除硬编码默认URL，强制从环境变量或数据库读取）
    env_url_key = "API_302_BASE_URL" if is_layering else "API_BASE_URL"
    db_url_name = "slicer_api_url" if is_layering else "global_api_url"
    db_key_name = "slicer_api_key" if is_layering else "global_api_key"

    # 2. 尝试从数据库获取用户自定义配置
    user_url = None
    user_key = None

    # [FIX] 如果没有传入 db，尝试自己创建一个会话
    db_session = db
    should_close_db = False
    if db_session is None:
        print("[LLM Config] 📝 没有传入 db，尝试创建新会话...")
        try:
            from app.core.database import AsyncSessionLocal
            import asyncio
            # 添加超时保护，防止数据库连接挂起
            db_session = await asyncio.wait_for(AsyncSessionLocal().__aenter__(), timeout=3.0)
            should_close_db = True
            print("[LLM Config] ✅ 数据库会话创建成功")
        except asyncio.TimeoutError:
            print("[LLM Config] ⚠️ 创建数据库会话超时 (3s)，将使用环境变量")
            db_session = None
        except Exception as e:
            print(f"[LLM Config] ⚠️ 创建数据库会话失败: {e}")
            db_session = None

    if db_session:
        try:
            print(f"[LLM Config] 🔍 正在查询数据库配置...")
            import asyncio
            # 批量查询需要的配置项
            query = select(UserConfig).where(UserConfig.key.in_([db_url_name, db_key_name, "global_api_key"]))
            result = await asyncio.wait_for(db_session.execute(query), timeout=3.0)
            configs = {c.key: c.value for c in result.scalars().all()}

            user_url = configs.get(db_url_name)
            user_key = configs.get(db_key_name)

            # 兼容性兜底：如果分层 Key 没设，尝试回退到 Global Key
            if is_layering and not user_key:
                user_key = configs.get("global_api_key")

            print(f"[LLM Config] ✅ 从数据库读取配置成功: url={user_url is not None}, key={user_key is not None}")

        except asyncio.TimeoutError:
            print("[LLM Config] ⚠️ 查询数据库超时 (3s)")
        except Exception as e:
            print(f"[LLM Config] ⚠️ 从数据库读取配置失败: {e}")
        finally:
            if should_close_db and db_session:
                try:
                    await db_session.close()
                except Exception as e:
                    print(f"[LLM Config] ⚠️ 关闭数据库会话失败: {e}")

    # 3. 确定最终 Base URL
    # 优先级: 数据库 -> 环境变量（不再使用硬编码默认）
    base_url = user_url or os.getenv(env_url_key) or os.getenv("API_BASE_URL")
    print(f"[LLM Config] 🔧 配置来源: user_url={bool(user_url)}, env={bool(os.getenv(env_url_key) or os.getenv('API_BASE_URL'))}")

    if not base_url:
        print(f"[LLM Config] ❌ 未配置 API Base URL")
        raise ValueError(
            f"[LLM Config] 未配置 API Base URL。"
            f"请在设置界面配置或在环境变量中设置 {env_url_key} 或 API_BASE_URL"
        )
    base_url = base_url.rstrip('/')

    # 调试日志：显示配置来源
    source = "数据库(用户设置)" if user_url else ("环境变量" if os.getenv(env_url_key) or os.getenv("API_BASE_URL") else "未知")
    print(f"[LLM Config] 使用配置来源: {source}, URL: {base_url[:50]}...")

    # 4. 确定最终 API Key
    # 优先级: 数据库 -> 场景环境变量 -> 通用环境变量
    api_key = user_key or os.getenv("API_302_KEY" if is_layering else "API_KEY") or os.getenv("API_KEY")

    # 5. 确保 base_url 格式正确 (适配 302.ai 的特殊路径或标准 v1 路径)
    if not (base_url.endswith('/v1') or "/302/submit" in base_url or ("api.302.ai" in base_url and is_layering)):
        base_url = f"{base_url}/v1"
        
    return base_url, api_key
