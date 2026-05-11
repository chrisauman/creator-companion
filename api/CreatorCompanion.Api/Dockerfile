FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first as its own layer so source edits don't bust the
# NuGet cache on every rebuild.
COPY CreatorCompanion.Api.csproj ./
RUN dotnet restore CreatorCompanion.Api.csproj

COPY . .
RUN dotnet publish CreatorCompanion.Api.csproj -c Release -o /app/out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Run as non-root. The base image doesn't ship an "app" user, so
# create one with a shell-less, password-less account.
RUN adduser --disabled-password --gecos '' --no-create-home --uid 10001 app \
 && chown -R app:app /app

COPY --from=build --chown=app:app /app/out .
USER app

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Note on health checks: Railway's platform healthcheck is configured
# via railway.json's `healthcheckPath` (more reliable than Dockerfile
# HEALTHCHECK on this image since dotnet/aspnet:10.0 doesn't ship
# curl/wget). Program.cs maps GET /health to a 200 OK response.

ENTRYPOINT ["dotnet", "CreatorCompanion.Api.dll"]
