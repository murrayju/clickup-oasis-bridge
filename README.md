# clickup-oasis-bridge

This node service registers itself to handle ClickUp webhooks. When a task is created (in the configured list), the data is mapped to Oasis Insight API calls.

## Configuration

This service uses the [dotenv](https://www.npmjs.com/package/dotenv) package to read its configuration from the process environment and/or from a `.env` file. This means there are several ways to provide this configuration, depending on the environment it is deployed into.

The following shows how to use these with the `docker run` command. You would normally only use 1 of the 3 alternatives demonstrated.

```bash
docker run \
  # You can specify individual variables
  -e PORT=1234
  # Or your can specify a .env file for docker to load
  --env-file /path/to/.env
  # Alternatively, you can mount the .env file
  -v ./path/to/.env:/app/.env
  ghcr.io/murrayju/clickup-oasis-bridge:latest
```

### Variables

The following table lists the available variables supported by the service.

| Name | Required | Default | Description |
| ---- | -------- | ------- | ----------- |
| `PUBLIC_URL` | :x: | Randomly generated ngrok url | It is recommended that you set up a public route to this service for ClickUp webhook integration. Specify the value like `https://bridge.example.com`. The service will automatically register the webhook URL with ClickUp. If not specified, ngrok is used to create a random secure tunnel proxied by ngrok. |
| `PORT` | :x: | `80` | The port to bind the web server to. This is used for the ClickUp webhook integration, where ClickUp will POST messages to this port. |
| CLICKUP_API_TOKEN | ✔️ | - | An API token is acquired from ClickUp, and is necessary for the integration to function. |
| CLICKUP_TEAM_ID | ✔️ | - | The ClickUp team id in which to register the webhook. This number can be found in the URL immediately after `https://app.clickup.com/` |
| CLICKUP_LIST_ID | ✔️ | - | The ClickUp list id in which to look for tasks to process. This can be found in the URL for a list: `https://app.clickup.com/{team_id}/v/l/f/{list_id}`
| CLICKUP_POLL_INTERVAL | :x: | `0` | The number of seconds to use as a polling interval to check the ClickUp list for unprocessed tasks. It is recommended to set this to `60`. This adds some reliability to the service, in case the webhook does not function, or is missed for any reason. This also makes it possible for tasks to be re-processed by transitioning the state back to `to-do` |
| OASIS_API_TOKEN | ✔️ | - | An API token is acquired from Oasis Insight, and is necessary for the integration to function. |
| OASIS_BASE_URL | ✔️ | - | The base URL for the Oasis API to connect to. Typically looks like `https://your-organization.oasisinsight.net/api/v1/`
| USE_CACHED_DETAILS | :x: | - | If set, the container will skip API calls to Oasis to get the necessary data from the `details` API, and will instead use cached values from the disk. This must be unset if any configuration has changed. |
| USE_CACHED_GROUPS | :x: | - | If set, the container will skip API calls to Oasis to get the necessary data from the `groups` API, and will instead use cached values from the disk. This must be unset if any configuration has changed. |
| WEBHOOK_HEALTHCHECK_INTERVAL | :x: | - | If set, the service will call the ClickUp API on an interval of the specified number of seconds, and write the result to the console. This is only useful for debugging/monitoring, and is not required to function. |
| DELETE_EXISTING_WEBHOOKS | :x: | - | If set, upon startup, the service can look for existing webhook registrations and delete them. This is useful to avoid receiving duplicate messages and processing tasks multiple times in the case where the server was not shut down cleanly to unregister itself. If set to `failing`, all webhooks with a failing status are deleted. If set to `matching`, all webhooks that match the current `PUBLIC_URL` will be deleted. It is recommended to use `matching` if `PUBLIC_URL` is set to a static address. |
IMPORT_TEST_CASE_AND_EXIT | :x: | - | If set, the service will process the given ClickUp task id and then exit. This exists purely for debugging purposes, and generally should not be used. |
