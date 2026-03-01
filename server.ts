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
    // If it's not a JWT, we'll try OAUTH, but we'll allow the header to be omitted 
    // if the token doesn't look like either to avoid the "invalid header" error.
    const tokenType = isJwt ? "JWT" : (token.length > 50 ? "OAUTH" : null);
    
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

    // Only add the token type header if we are reasonably sure, 
    // or allow it to be omitted as Snowflake can often infer it.
    // Some "Programmatic tokens" might not like this header if they are session-based.
    if (tokenType) {
      headers["X-Snowflake-Authorization-Token-Type"] = tokenType;
    }

    try {
      const response = await fetch(snowflakeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          statement: sql,
          timeout: 60,
          database,
          schema,
          warehouse,
          role
        })
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        console.log("Snowflake Response Status:", response.status);
        res.json(data);
      } else {
        const text = await response.text();
        console.error(`Snowflake Error (${response.status}):`, text.substring(0, 1000));
        
        let hint = "Check your SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN.";
        if (response.status === 401) {
          hint = `Authentication failed (401). Your SNOWFLAKE_TOKEN is invalid or expired.
          
          HOW TO FIX:
          1. If you are using an OAuth token, ensure it hasn't expired.
          2. If you are trying to use your Snowflake password, STOP. The SQL API requires an OAuth Token or Key-Pair authentication.
          3. For a quick test, you can generate a temporary token using the Snowflake CLI (snowsql): 'snowsql -a your_account -u your_user --generate-jwt' (if configured).
          4. Alternatively, ensure your Service Account has the correct 'ACCOUNTADMIN' role assigned in the request.`;
        }
        if (response.status === 404) {
          const testUrl = `https://${account}.snowflakecomputing.com/console/login`;
          hint = `Snowflake returned a 404 (Not Found). This means the URL "https://${account}.snowflakecomputing.com" does not exist. 
          
          HOW TO FIX:
          1. Try opening this URL in your browser: ${testUrl}
          2. If it doesn't load a login page, your SNOWFLAKE_ACCOUNT identifier is wrong.
          3. To find the correct one: Log in to Snowflake, click your name (bottom-left) -> Account -> Copy the identifier (e.g., "MYORG-MYACCOUNT").
          4. If you are using a locator like "UF75979", you MUST add the region (e.g., "UF75979.us-east-1").`;
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
