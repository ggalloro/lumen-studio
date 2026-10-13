# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

# Runtime stage
FROM eclipse-temurin:21-jre
RUN groupadd --system lumen && useradd --system --gid lumen --home-dir /app lumen \
    && mkdir -p /app /data && chown lumen:lumen /data
WORKDIR /app
COPY --from=build /src/target/assets.jar /app/assets.jar

ENV PORT=8082 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 8082
USER lumen
ENTRYPOINT ["java", "--enable-native-access=ALL-UNNAMED", "-jar", "/app/assets.jar"]
