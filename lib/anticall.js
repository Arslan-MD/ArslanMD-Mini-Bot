module.exports = function registerAntiCall(arslan, config) {
  if (arslan.__antiCallRegistered) return;

  arslan.ev.on("call", async (calls) => {
    if (config.ANTI_CALL !== "true") return;

    for (const call of calls) {
      if (call.status !== "offer") continue;
      await arslan.rejectCall(call.id, call.from);
    }
  });

  arslan.__antiCallRegistered = true;
};
