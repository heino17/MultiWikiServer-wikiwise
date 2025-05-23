Oracles are clues that give information about a response without revealing the actual response.

## Compression Oracles

A compression oracle is any kind of attack that takes advantage of compression sizes to guess the possible nature of a plaintext. For instance, if an attacker is able to feed an arbitrary plaintext to a user's webpage the compressed size changes depending on whether or not the arbitrary plaintext also appears elsewhere in the page. The attack requires rather careful setup, and requires being able to monitor or infer the size of the page response, which is fairly easy for someone with a deep knowledge of internet protocols.

Here is a description of the CRIME attack, for example.

> The attacker can control request send by the client (using javascript for example). The goal is to retrieve secret cookie. The attacker sends multiple requests  and checks the length of the encrypted data. Since `cookie=q` match `cookie=quokkalight` from the secret cookie, the length of the encrypted data will be the same and the attacker knows he found a byte.

However browsers already implement mitigations to this. In HTTP/1.1, headers are not compressed, and in HTTP/2 and beyond, the header compression that is implemented is carefully designed to avoid header compression oracles (unless you happen to guess an unrestricted header *exactly*). Browsers never compress the request body. So the only possibility we're left with are compression oracles in the response body. 

The key to all of these attacks is being able to somehow insert arbitrary plaintext in the response and to determine the response length. 

## Length Oracle

A similar attack involves inspecting the request length to determine whether a request returned any results. This is especially true of search features. A very big response implies returned results and a very tiny response implies no results. 
