import express from "express";
import helmet from "helmet";
import { config } from "./config/config.js";

const app = express();

app.use(express.json());
app.use(helmet());

app.get("/", (_req, res) => {
    console.log("Received request to /");
    res.json({ status: "ok" });
});

app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
});