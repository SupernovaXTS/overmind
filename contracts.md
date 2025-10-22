Contracts:

Part 1: Sender sets code 100 with a non null id
Part 2: Reciever sets code 100 and sets uid to contract uid
Part 3: Sender creates sell order for one pixel at contract price. Sender sets deal property to deal id and uid to contract uid
Part 4: Reciever fufill deal and returns code 300. Reciever updates time to contract expiry
Part 5: Sender sets code 300.
Part 6: Reciever sets code 0