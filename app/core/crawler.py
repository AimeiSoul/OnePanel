import httpx
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

async def get_remote_http_title(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    
    try:
        async with httpx.AsyncClient(headers=headers, timeout=6.0, follow_redirects=True) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.warning(f"无法访问 URL: {url}, 状态码: {response.status_code}")
                return ""

            content = response.content
            soup = BeautifulSoup(content, "html.parser", from_encoding=response.encoding)
            
            if soup.title and soup.title.string:
                title_text = soup.title.string.strip()
                return " ".join(title_text.split())
                
    except httpx.RequestError as exc:
        logger.error(f"请求发生异常: {exc} (URL: {url})")
    except Exception as e:
        logger.error(f"解析标题时发生未知错误: {e}")
        
    return ""