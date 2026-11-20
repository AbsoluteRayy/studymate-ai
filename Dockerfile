FROM node:20-slim

WORKDIR /app

# Copy package files dan install dependencies frontend
COPY package*.json ./
RUN npm install

# Copy seluruh source code & build frontend React
COPY . .
RUN npm run build

# Install dependencies backend
RUN npm --prefix backend install

# Hugging Face Spaces menggunakan port 7860 secara default
ENV PORT=7860
EXPOSE 7860

# Jalankan server Express
CMD ["npm", "--prefix", "backend", "start"]