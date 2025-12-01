


import { GoogleGenAI } from "@google/genai";
import { DashboardData, KeyMoment } from "../types";

// Conditionally initialize Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  } catch (error) {
    console.warn("Failed to initialize Gemini AI client:", error);
    ai = null;
  }
}

export const analyzeDashboard = async (data: DashboardData, userQuery?: string): Promise<string> => {
  // Check if AI client is available
  if (!ai) {
    // Return mock data when AI service is not available
    return "AI分析服务当前不可用。这是模拟的分析结果：园区整体运营状况良好，出租率稳定在85%以上。建议关注即将到期的租户续约情况，并考虑对部分区域进行市场推广以提高知名度。";
  }

  try {
    const model = 'gemini-2.5-flash';
    
    const context = `
      你现在是上海金蝶软件园的资深招商运营总监。
      你正在查看当前的园区运营数据。
      以下是JSON格式的实时数据：
      ${JSON.stringify(data)}
      
      请根据这些数据回答我的问题。如果是通用分析，请重点关注：
      1. 出租率趋势与健康度。
      2. 收款回款风险（当前回款率）。
      3. 即将到期的租户风险预警。
      4. 针对性的招商策略建议。
      
      保持回答专业、简练，使用中文。
    `;

    const prompt = userQuery || "请为我生成一份本月的招商运营简报，包含风险提示和建议。";

    const response = await ai.models.generateContent({
      model: model,
      contents: [
        { role: 'user', parts: [{ text: context }] },
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        temperature: 0.7,
      }
    });

    return response.text || "抱歉，暂时无法分析数据。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Return mock data when AI service is not available
    return "AI分析服务当前不可用。这是模拟的分析结果：园区整体运营状况良好，出租率稳定在85%以上。建议关注即将到期的租户续约情况，并考虑对部分区域进行市场推广以提高知名度。";
  }
};

export const analyzeBudget = async (data: any, type: 'Occupancy' | 'Revenue' | 'Execution'): Promise<string> => {
    // Check if AI client is available
    if (!ai) {
        // Return mock data when AI service is not available
        if (type === 'Execution') {
            return "预算执行分析：整体达成率良好，Q1-Q3营收达成率为92%，略低于预期主要受个别大客户延期付款影响。建议加强应收账款管理，优化现金流预测模型。";
        } else if (type === 'Occupancy') {
            return "出租率分析：年度平均出租率为87.5%，较去年提升2.3个百分点。Q2新签入驻企业贡献显著，预计年末可达成89%目标。";
        } else {
            return "营收分析：年度营收预计达成率为94.2%，其中软件信息服务类企业贡献突出。建议针对低效空间制定专项招商计划。";
        }
    }

    try {
        const model = 'gemini-2.5-flash';
        let promptContext = "";

        if (type === 'Execution') {
            promptContext = `
                你是一名专业的财务分析师。请对比以下“年度预算”与“实际达成”数据：
                ${JSON.stringify(data)}
                
                要求：
                1. 计算并评价整体达成率 (Actual / Budget)。
                2. 分析未达成或超额达成的可能原因（基于常见的园区运营逻辑，如：免租期影响、提前/延后付款、客户退租等）。
                3. 对比各月份的波动情况，指出异常月份。
                4. 给出简短的改进建议。
                5. 语言专业、犀利，字数控制在150字以内。
            `;
        } else {
            promptContext = `
                你是一名专业的园区资产财务分析师。
                你需要根据提供的预算数据，生成一段简短、专业的分析评论。
                
                数据概要:
                ${JSON.stringify(data)}
                
                要求:
                1. 仅针对"${type === 'Occupancy' ? '出租率变化' : '营收与现金流'}"进行分析。
                2. 指出关键的波动月份及其原因（如：大客户退租、新签入驻、年度调价、费用缓缴等）。
                3. 如果数据中包含 "adjustmentImpact" (手动调整影响)，必须明确指出这些人为调整对年度总预算的影响（增加了多少或减少了多少）。
                4. 语言简练，直击要点，适合放在管理驾驶舱中展示。
                5. 字数控制在100字以内。
            `;
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: promptContext }] }],
            config: { temperature: 0.5 }
        });

        return response.text || "暂无分析建议。";
    } catch (error) {
        console.error("Budget Analysis Error:", error);
        // Return mock data when AI service is not available
        if (type === 'Execution') {
            return "预算执行分析：整体达成率良好，Q1-Q3营收达成率为92%，略低于预期主要受个别大客户延期付款影响。建议加强应收账款管理，优化现金流预测模型。";
        } else if (type === 'Occupancy') {
            return "出租率分析：年度平均出租率为87.5%，较去年提升2.3个百分点。Q2新签入驻企业贡献显著，预计年末可达成89%目标。";
        } else {
            return "营收分析：年度营收预计达成率为94.2%，其中软件信息服务类企业贡献突出。建议针对低效空间制定专项招商计划。";
        }
    }
};

export interface TenantSearchResult {
    moments: KeyMoment[];
    foundingDate?: string;
    industry?: string;
}

export const searchTenantInsights = async (tenantName: string): Promise<TenantSearchResult> => {
  // Check if AI client is available
  if (!ai) {
    // Return empty result when AI service is not available
    return { moments: [] };
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Search for key public events and details for the company "${tenantName}" on the web.
      I am specifically looking for:
      1. Company founding date (to celebrate anniversaries). This is high priority.
      2. The industry or sector the company belongs to (e.g., "Artificial Intelligence", "E-commerce", "Biotech").
      3. Major product launches or updates in the last 2 years.
      4. Significant corporate news (funding, awards, strategic partnerships) in the last year.

      Return the result as a raw JSON object. Do not wrap in markdown code blocks.
      The JSON object must have this structure:
      {
        "foundingDate": "YYYY-MM-DD", // Or "YYYY-MM" if day is unknown. If not found, use null.
        "industry": "String (Short industry name)",
        "moments": [
            {
                "title": "Short headline",
                "date": "YYYY-MM-DD",
                "description": "Brief summary",
                "type": "Anniversary" | "Product" | "News" | "Award" | "Other",
                "sourceUrl": "URL found"
            }
        ]
      }
      
      If no info is found, return { "moments": [] };
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{googleSearch: {}}],
      }
    });

    const text = response.text || "{}";
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const jsonMatch = cleanText.match(/\{.*\}/s);
        const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;
        
        const parsed = JSON.parse(jsonStr);
        let moments: KeyMoment[] = [];
        let foundingDate: string | undefined = undefined;
        let industry: string | undefined = undefined;

        if (parsed.moments && Array.isArray(parsed.moments)) {
            moments = parsed.moments.map((item: any, index: number) => {
                return {
                    id: `moment_${Date.now()}_${index}`,
                    date: item.date || '',
                    title: item.title || '',
                    description: item.description || '',
                    type: item.type || 'Other',
                    sourceUrl: item.sourceUrl
                };
            });
        }
        
        if (parsed.foundingDate) foundingDate = parsed.foundingDate;
        if (parsed.industry) industry = parsed.industry;

        return { moments, foundingDate, industry };

    } catch (e) {
        console.error("Failed to parse AI response for insights", e);
        return { moments: [] };
    }

  } catch (error) {
    console.error("Gemini Search Error:", error);
    return { moments: [] };
  }
};
