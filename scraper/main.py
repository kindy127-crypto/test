"""Tech Daily Digest - 每日前沿科技自动聚合爬虫"""

import json
import os
import re
import time
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree

import feedparser
import requests

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "data")

# 前沿科技关键词
KEYWORDS = [
    "quantum computing", "quantum chip", "neuromorphic", "semiconductor",
    "photonic", "MEMS", "robotics", "drone", "autonomous vehicle",
    "energy storage", "battery", "solar cell", "nuclear fusion",
    "biotech", "brain computer", "gene editing", "CRISPR",
    "chip design", "RISC-V", "edge computing", "sensor",
    "3D printing", "material science", "superconductor",
]

KEYWORDS_CN = [
    "芯片", "量子", "半导体", "机器人", "无人机",
    "电池", "新能源", "核聚变", "生物技术", "脑机接口",
    "光子", "传感器", "材料", "超导", "前沿",
]


def fetch_arxiv(max_results=30):
    """从 arXiv 获取前沿科技相关论文"""
    query = " OR ".join(f'all:"{kw}"' for kw in KEYWORDS)
    url = "http://export.arxiv.org/api/query"
    params = {
        "search_query": query,
        "start": 0,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"arXiv fetch error: {e}")
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ElementTree.fromstring(resp.text)
    items = []

    for entry in root.findall("atom:entry", ns):
        title = entry.find("atom:title", ns).text.strip().replace("\n", " ")
        summary = entry.find("atom:summary", ns).text.strip().replace("\n", " ")[:200]
        link = entry.find("atom:id", ns).text.strip()
        published = entry.find("atom:published", ns).text.strip()[:10]
        categories = [c.get("term") for c in entry.findall("atom:category", ns)]

        items.append({
            "source": "arxiv",
            "title": title,
            "summary": summary,
            "url": link,
            "date": published,
            "tags": categories[:3],
        })

    return items


def fetch_hackernews(max_results=30):
    """从 Hacker News 获取前沿科技热门文章"""
    items = []
    seen = set()

    for kw in ["quantum", "semiconductor chip", "robotics hardware", "battery technology",
                "neuromorphic", "photonic computing", "fusion energy", "brain computer interface",
                "RISC-V", "CRISPR", "3D printing", "superconductor", "solar cell",
                "autonomous vehicle", "drone", "sensor", "edge computing"]:
        if len(items) >= max_results:
            break
        try:
            url = "https://hn.algolia.com/api/v1/search"
            params = {
                "query": kw,
                "tags": "story",
                "numericFilters": "points>5",
                "hitsPerPage": 8,
            }
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"HN fetch error for '{kw}': {e}")
            continue

        for hit in data.get("hits", []):
            oid = hit.get("objectID", "")
            if oid in seen:
                continue
            seen.add(oid)
            title = hit.get("title", "")
            url = hit.get("url", f"https://news.ycombinator.com/item?id={oid}")
            points = hit.get("points", 0)
            created = datetime.fromtimestamp(hit.get("created_at_i", 0), tz=timezone.utc).strftime("%Y-%m-%d")

            items.append({
                "source": "hackernews",
                "title": title,
                "summary": f"{points} points on Hacker News",
                "url": url,
                "date": created,
                "tags": [kw.split()[0]],
            })

        time.sleep(0.3)

    items.sort(key=lambda x: x.get("date", ""), reverse=True)
    return items[:max_results]


def fetch_github_trending(max_results=20):
    """从 GitHub Trending 获取热门项目"""
    items = []

    for lang in ["c", "cpp", "python", "rust", "jupyter notebook", "go", "swift", "kotlin"]:
        if len(items) >= max_results:
            break
        try:
            url = f"https://api.gitterapp.com/repositories"
            params = {"language": lang, "since": "daily"}
            resp = requests.get(url, params=params, timeout=15)
            if resp.status_code != 200:
                continue
            data = resp.json()
        except Exception:
            continue

        for repo in data[:5]:
            if len(items) >= max_results:
                break
            name = repo.get("author", "") + "/" + repo.get("name", "")
            desc = repo.get("description", "") or ""

            items.append({
                "source": "github",
                "title": name,
                "summary": desc[:200],
                "url": repo.get("url", f"https://github.com/{name}"),
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "tags": [lang] if lang != "jupyter notebook" else ["python"],
            })

        time.sleep(0.3)

    # 如果 gitterapp API 不可用，尝试备用方式
    if not items:
        try:
            url = "https://github.com/trending?since=daily"
            resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                # 简单解析 HTML
                repos = re.findall(
                    r'<h2 class="h3 lh-condensed">.*?<a[^>]*href="(/[^/]+/[^"]+)"[^>]*>\s*\n\s*<span[^>]*>([^<]+)</span>',
                    resp.text, re.DOTALL
                )
                for path, name in repos[:max_results]:
                    name = name.strip()
                    path = path.strip()
                    items.append({
                        "source": "github",
                        "title": name,
                        "summary": "",
                        "url": f"https://github.com{path}",
                        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "tags": [],
                    })
        except Exception as e:
            print(f"GitHub trending fallback error: {e}")

    return items


def fetch_36kr(max_results=30):
    """从 36Kr RSS 获取科技新闻"""
    items = []

    try:
        feed = feedparser.parse("https://36kr.com/feed")
    except Exception as e:
        print(f"36Kr fetch error: {e}")
        return []

    for entry in feed.entries[:50]:
        if len(items) >= max_results:
            break
        title = entry.get("title", "")

        summary = entry.get("summary", "")[:200]
        # 去除 HTML 标签
        summary = re.sub(r"<[^>]+>", "", summary).strip()
        link = entry.get("link", "")
        published = entry.get("published_parsed")
        date_str = time.strftime("%Y-%m-%d", published) if published else datetime.now().strftime("%Y-%m-%d")

        items.append({
            "source": "36kr",
            "title": title,
            "summary": summary,
            "url": link,
            "date": date_str,
            "tags": [],
        })

    return items


def fetch_apple_patents(max_results=15):
    """从 Google News RSS 获取 Apple 专利相关新闻"""
    items = []
    queries = [
        ("Apple patent", "https://news.google.com/rss/search?q=Apple+patent&hl=en-US&gl=US&ceid=US:en"),
        ("苹果 专利", "https://news.google.com/rss/search?q=%E8%8B%B9%E6%9E%9C+%E4%B8%93%E5%88%A9&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"),
    ]

    for label, url in queries:
        try:
            feed = feedparser.parse(url)
        except Exception as e:
            print(f"Apple patents fetch error ({label}): {e}")
            continue

        for entry in feed.entries:
            if len(items) >= max_results:
                break
            title = entry.get("title", "")
            summary = entry.get("summary", "")[:200]
            summary = re.sub(r"<[^>]+>", "", summary).strip()
            link = entry.get("link", "")
            published = entry.get("published_parsed")
            date_str = time.strftime("%Y-%m-%d", published) if published else datetime.now().strftime("%Y-%m-%d")

            # 去重
            if any(i["url"] == link for i in items):
                continue

            items.append({
                "source": "apple_patent",
                "title": title,
                "summary": summary,
                "url": link,
                "date": date_str,
                "tags": [label.split()[0]],
            })

    return items[:max_results]


def main():
    today = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    print(f"Scraping for {today}...")

    all_items = []

    print("Fetching arXiv...")
    all_items.extend(fetch_arxiv())

    print("Fetching Hacker News...")
    all_items.extend(fetch_hackernews())

    print("Fetching GitHub Trending...")
    all_items.extend(fetch_github_trending())

    print("Fetching 36Kr...")
    all_items.extend(fetch_36kr())

    print("Fetching Apple Patents...")
    all_items.extend(fetch_apple_patents())

    print(f"Total items: {len(all_items)}")

    data = {
        "date": today,
        "items": all_items,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, f"{today}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Saved to {output_path}")

    # 生成日期索引
    dates = sorted(
        [f.replace(".json", "") for f in os.listdir(DATA_DIR) if f.endswith(".json") and f != "index.json"],
        reverse=True,
    )
    index_path = os.path.join(DATA_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump({"dates": dates}, f, ensure_ascii=False)
    print(f"Updated index with {len(dates)} dates")


if __name__ == "__main__":
    main()
