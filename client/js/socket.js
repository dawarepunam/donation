const socket = io();

socket.on("donation:new", (data) => {
  if (typeof window.addLiveDonation === "function") {
    window.addLiveDonation(data);
  }
});
