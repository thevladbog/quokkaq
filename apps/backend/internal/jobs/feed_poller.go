package jobs

import "context"

// SignageFeedPollRunner is the subset of signage service methods used by [TypeSignageFeedPoll] tasks
// (implemented by *services.signageService in cmd/api).
type SignageFeedPollRunner interface {
	PollDueFeeds(ctx context.Context) error
}
