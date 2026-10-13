# Build stage
FROM maven:3.8-eclipse-temurin-11 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

# Runtime stage
FROM eclipse-temurin:11-jre
RUN groupadd --system lumen && useradd --system --gid lumen --home-dir /app lumen \
    && mkdir -p /app /data && chown lumen:lumen /data
WORKDIR /app
COPY --from=build /src/target/rights.jar /app/rights.jar

ENV PORT=8087 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 8087
USER lumen
ENTRYPOINT ["java", "-jar", "/app/rights.jar"]
