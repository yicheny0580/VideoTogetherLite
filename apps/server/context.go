package main

type VideoTogetherLiteContext struct {
	Language string
}

func NewVideoTogetherLiteContext(language string) *VideoTogetherLiteContext {
	return &VideoTogetherLiteContext{
		Language: language,
	}
}
