## Simulation Manager (simman) 

The simulation manager (simman) is responsible for managing the simulation runs. Primarily, it does the following: 

1. Listen to database triggers. 
2. Queues new simulation request etc.
3. Creates or terminates an EC2 instance based on the specific database trigger. 

