# Collab Editor 🚀

A real-time collaborative code editor with multi-user support, live cursor tracking, and code execution using Judge0.

## 🔥 Features

- 👥 Real-time collaboration using Yjs + WebSockets  
- 🧠 Multi-language code execution (JavaScript, Python, C++, Java, etc.)  
- ⚡ Monaco Editor (VS Code-like experience)  
- 🎯 Live user presence & cursor tracking  
- 🖥️ Built-in terminal output panel  
- 📋 Shareable room link for collaboration  
- 🐳 Dockerized full-stack deployment  

## 🛠️ Tech Stack

- Frontend: React + Monaco Editor  
- Backend: Node.js + Express  
- Realtime: Yjs + Socket.IO  
- Code Execution: Judge0 API  
- Deployment: Docker  

## 🚀 How to Run Locally

### 1. Clone repo
git clone git@github.com:Aman-Rautela/collab-editor.git

### 2. Run with Docker
docker build -t collab-editor .
docker run -p 5000:5000 collab-editor

### 3. Open
http://localhost:5000

## 🌐 Live Demo

(Add your Render link here after deployment)

## 🧠 How it Works

- Users join with a username  
- Shared editor syncs using Yjs  
- Cursor positions are visible in real-time  
- Code is sent to Judge0 API for execution  
- Output is displayed in terminal  

## 📁 Project Structure

- Frontend → React + Vite  
- Backend → Express server serving static files  
- Docker → Builds frontend and serves via backend  

## 👨‍💻 Author

Aman Rautela

---
