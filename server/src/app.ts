import express from "express";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
    console.log("Received request to /");
    res.json({ status: "ok" });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});