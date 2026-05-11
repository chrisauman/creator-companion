FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Single combined restore+publish. An earlier version split this into
# two layers ("COPY .csproj → restore", then "COPY . → publish --no-restore")
# for better layer caching, but the standalone `dotnet restore` step
# OOM-killed (exit 137) under Railway's build memory budget — turning
# every commit into a failed deploy. The combined `dotnet publish` does
# the same work in a single process that the SDK can pipeline, which
# fits within the budget. Don't split this again without testing on
# Railway specifically.
#
# /p:UseCurrentRuntime=true also helps: it tells the SDK to restore
# only the RID we're actually building for (linux-x64) instead of every
# runtime identifier in the metadata, further reducing peak memory.
COPY . .
RUN dotnet publish CreatorCompanion.Api.csproj \
    -c Release \
    -o /app/out \
    /p:UseCurrentRuntime=true

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
