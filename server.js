import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors()); // ✅ allow frontend to call this
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/embed', async (req, res) => {
  try {
    const { text } = req.body;
    
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,  // single string or array
    });

    // extract the values array from response
    const embedding = response.embeddings[0].values;
    
    res.json({ embedding });
  } catch (error) {
    console.error('Embed error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));