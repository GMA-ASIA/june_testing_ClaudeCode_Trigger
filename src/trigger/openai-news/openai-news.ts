import { schedules } from "@trigger.dev/sdk";
import { Client } from "@notionhq/client";
import { XMLParser } from "fast-xml-parser";

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  source?: { "#text": string; "@_url": string } | string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

export const openaiNewsTask = schedules.task({
  id: "openai-news-to-notion",
  cron: "0 9 * * 1", // Every Monday at 9am UTC

  run: async () => {
    const notionApiKey = process.env.NOTION_API_KEY;
    if (!notionApiKey) throw new Error("NOTION_API_KEY is not set");

    const notionPageId = process.env.NOTION_PAGE_ID;
    if (!notionPageId) throw new Error("NOTION_PAGE_ID is not set");

    const rssUrl =
      "https://news.google.com/rss/search?q=openai&hl=en-US&gl=US&ceid=US:en";
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
    });
    if (!response.ok) throw new Error(`RSS fetch failed: ${response.status}`);

    const xmlText = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(xmlText);
    const rawItems: RssItem[] = parsed?.rss?.channel?.item ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    const top10 = items.slice(0, 10);

    if (top10.length === 0) {
      console.log("No articles found in RSS feed");
      return { articlesAdded: 0 };
    }

    const notion = new Client({ auth: notionApiKey });

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const articleBlocks = top10.flatMap((item) => {
      const sourceName =
        typeof item.source === "object"
          ? item.source["#text"]
          : item.source ?? "Unknown";

      const pubDate = item.pubDate
        ? new Date(item.pubDate).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";

      const summary = item.description
        ? stripHtml(item.description).slice(0, 500)
        : "";

      const blocks: object[] = [
        {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: { content: item.title, link: { url: item.link } },
              },
              {
                type: "text",
                text: { content: `\n${sourceName} · ${pubDate}` },
                annotations: { color: "gray" },
              },
            ],
          },
        },
      ];

      if (summary) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: [
              {
                type: "text",
                text: { content: summary },
                annotations: { italic: true },
              },
            ],
          },
        });
      }

      return blocks;
    });

    await notion.blocks.children.append({
      block_id: notionPageId,
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: { content: `OpenAI News — ${dateStr}` },
              },
            ],
          },
        },
        ...articleBlocks,
        {
          object: "block",
          type: "divider",
          divider: {},
        },
      ],
    });

    console.log(`Added ${top10.length} articles to Notion for ${dateStr}`);
    return { articlesAdded: top10.length, date: dateStr };
  },
});
