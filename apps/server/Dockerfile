FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/videotogether-server .

FROM gcr.io/distroless/static-debian12:nonroot

ENV LISTEN_ADDR=:8080 \
    ROOM_TTL=3m \
    ALLOWED_ORIGINS=*

WORKDIR /app
COPY --from=build /out/videotogether-server /app/videotogether-server

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/videotogether-server"]
CMD ["prod"]
