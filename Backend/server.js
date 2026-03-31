import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import { YSocketIO } from "y-socket.io/dist/server"

const app = express();

app.use(express.static("public"))

const httpServer = createServer(app)


const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["POST", "GET"]
    }
})


const ySocketIO = new YSocketIO(io);
ySocketIO.initialize();


//2 health check routes

// app.get("/", (req, res) => {
//     res.status(200).json({
//         message: "Server is running",
//         success: true
//     })
// })

app.get("/health", (req, res) => {
    res.status(200).json({
        message: "ok",
        success: true
    })
})



httpServer.listen(3000, () => {
    console.log("Server is running on port number - 3000");
})