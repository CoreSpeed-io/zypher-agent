
import { APIError } from "@openai/openai";
import { formatError } from "../error.ts";



// const response = await client.responses.create({
//     model: "o3-pro-2025-06-10",
//     reasoning: {
//       effort: "high"
//     },
//     input: [
//       {
//         role: "user",
//         content: [
//           {
//             type: "input_file",
//             file_id: uploadedFile.id,
//           },
//           {
//             type: "input_text",
//             text: question,
//           },
//         ],
//       },
//     ],
//   });



async function callOpenAIReflection(prompt: string): Promise<{
  should_reflect: boolean;
  suggestion: string;
}> {
  return {
    should_reflect: false,
    suggestion: ''
  };
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o", // or any OpenAI model you want
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant who provides reflective analysis.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI error: ${response.status} - ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "[No response]";
  } catch (err) {
    return {
      should_reflect: false,
      suggestion: handleQuestionToolError(err),
    };
  }
}


function handleQuestionToolError(error: unknown): string {
  if (error instanceof APIError) {
    switch (error.status) {
      case 429:
        return `OpenAI's servers are busy right now. Please wait a few minutes then try again. (Error: ${error.message})`;
      case 400:
        return `OpenAI couldn't process your request. This may be due to an unsupported image or question format. (Error: ${error.message})`;
      case 401:
        return `There's an issue with the OpenAI API key. Please check that it is set correctly in the environment variables. (Error: ${error.message})`;
      default:
        return `OpenAI encountered an error while answering your question. Please try again in a few minutes. (Error: ${error.message})`;
    }
  }
  return `Something went wrong while answering your question. ${formatError(error)
    }`;
}
export { callOpenAIReflection };