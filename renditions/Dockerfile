FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/renditions .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/renditions /renditions
ENV PORT=8083
EXPOSE 8083
USER nonroot:nonroot
ENTRYPOINT ["/renditions"]
