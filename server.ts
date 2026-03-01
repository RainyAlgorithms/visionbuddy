import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Snowflake SQL API Proxy
  app.post("/api/snowflake/execute", async (req, res) => {
    const { sql } = req.body;
    
    let account = process.env.SNOWFLAKE_ACCOUNT || "";
    const token = process.env.SNOWFLAKE_TOKEN;
    const database = process.env.SNOWFLAKE_DATABASE;
    const schema = process.env.SNOWFLAKE_SCHEMA;
    const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
    const role = process.env.SNOWFLAKE_ROLE;

    // Sanitize account: Remove https:// and .snowflakecomputing.com if present
    account = account.replace(/^https?:\/\//, "").replace(/\.snowflakecomputing\.com\/?$/, "");

    if (!account || !token) {
      return res.status(500).json({ error: "Snowflake credentials missing in environment." });
    }

    // Detect token type: JWTs usually start with 'ey'
    const isJwt = token.startsWith("ey");
    // Only send the header if it's a JWT. For other tokens, Snowflake can usually infer it.
    // If it's an OAuth token and fails, the user may need to explicitly set this.
    const tokenType = isJwt ? "JWT" : null;
    
    const snowflakeUrl = `https://${account}.snowflakecomputing.com/api/v2/statements`;
    console.log(`Executing Snowflake SQL on: ${snowflakeUrl} using ${tokenType}`);
    
    // Check for common locator-only mistake
    if (account.length === 7 && !account.includes(".") && !account.includes("-")) {
      console.warn("WARNING: Your SNOWFLAKE_ACCOUNT looks like a locator (e.g., UF75979) without a region. This will likely fail with a 404.");
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    const body: any = {
      statement: sql,
      timeout: 60
    };

    if (database) body.database = database;
    if (schema) body.schema = schema;
    if (warehouse) body.warehouse = warehouse;
    if (role) body.role = role;

    try {
      const response = await fetch(snowflakeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        console.log("Snowflake Response Status:", response.status);
        if (response.status >= 400) {
          console.error("Snowflake API Error Detail:", JSON.stringify(data, null, 2));
          // Extract the actual message from Snowflake if available
          const errorMsg = data.message || data.error || "Snowflake API Error";
          let hint = response.status === 400 ? "\n\nHint: This often means the SQL is invalid or the table doesn't exist yet. If you haven't pinned any locations, this is normal." : "";
          
          if (errorMsg.includes("warehouse")) {
            hint = "\n\nHint: Your Snowflake request failed because no warehouse was specified or the specified warehouse is invalid. Please check your SNOWFLAKE_WAREHOUSE environment variable.";
          } else if (errorMsg.includes("database") || errorMsg.includes("schema")) {
            hint = "\n\nHint: Your Snowflake request failed because the database or schema was not found. Please check your SNOWFLAKE_DATABASE and SNOWFLAKE_SCHEMA environment variables.";
          } else if (errorMsg.includes("X-Snowflake-Authorization-Token-Type")) {
            hint = "\n\nHint: Snowflake rejected the authorization header type. This can happen with some OAuth providers. The app will try to adapt, but you may need to check your token type.";
          }

          return res.status(response.status).json({ 
            ...data,
            error: errorMsg,
            hint: hint + (data.hint || "")
          });
        }
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.error(`Snowflake Non-JSON Error (${response.status}):`, text.substring(0, 1000));
        
        let hint = "Snowflake returned a non-JSON response. Check your SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN.";
        if (response.status === 401) {
          hint = "Authentication failed (401). Your SNOWFLAKE_TOKEN is invalid or expired.";
        } else if (response.status === 403) {
          hint = "Forbidden (403). Your token might not have permission to use the SQL API, or your IP might be blocked by Snowflake Network Policies.";
        } else if (response.status === 404) {
          hint = `Snowflake returned a 404. The account identifier "${account}" might be incorrect.`;
        }
        if (text.includes("ErrorContainer")) hint = "Snowflake returned a branded error page. This usually means the URL is valid but the request was rejected (e.g., IP blocking or invalid credentials).";

        console.log(`DEBUG: Failed URL was ${snowflakeUrl}`);

        res.status(response.status).json({ 
          error: "Snowflake returned an HTML error page instead of JSON.",
          status: response.status,
          hint,
          detail: text.substring(0, 200)
        });
      }
    } catch (error) {
      console.error("Snowflake API Error:", error);
      res.status(500).json({ error: "Failed to communicate with Snowflake." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Ghostwriter Server running on http://localhost:${PORT}`);
  });
}

startServer();
